type SolanaAccount = {
  address: string;
  publicKey: Uint8Array;
  chains: string[];
};

type SolanaWallet = {
  name: string;
  accounts: SolanaAccount[];
  features: Record<string, unknown>;
};

type WalletRegister = (wallet: SolanaWallet) => void;
type WalletRegistryApi = { register: WalletRegister };
type RegisterWallet = (api: WalletRegistryApi) => void;

type ConnectFeature = {
  connect: (options?: { silent?: boolean }) => Promise<{ accounts: SolanaAccount[] }>;
};

type SignMessageFeature = {
  signMessage: (input: {
    account: SolanaAccount;
    message: Uint8Array;
  }) => Promise<Array<{ signature: Uint8Array }>>;
};

const wallets = new Map<string, SolanaWallet>();
let registryReady = false;

function initializeWalletStandard() {
  if (registryReady || typeof window === "undefined") return;
  registryReady = true;

  window.addEventListener("wallet-standard:register-wallet", (event: Event) => {
    const registerWallet = (event as CustomEvent<RegisterWallet>).detail;
    registerWallet?.({ register: (wallet) => wallets.set(wallet.name, wallet) });
  });

  window.dispatchEvent(
    new CustomEvent<WalletRegister>("wallet-standard:app-ready", {
      detail: { register: (wallet) => wallets.set(wallet.name, wallet) },
    }),
  );
}

function getMetaMaskWallet(): Promise<SolanaWallet> {
  initializeWalletStandard();
  const existing = [...wallets.values()].find((wallet) =>
    wallet.name.toLowerCase().includes("metamask"),
  );
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("wallet-standard:register-wallet", onRegister);
      reject(new Error("No se detectó MetaMask. Instala o actualiza MetaMask y vuelve a intentarlo."));
    }, 1800);

    const onRegister = (event: Event) => {
      const registerWallet = (event as CustomEvent<RegisterWallet>).detail;
      registerWallet?.({ register: (wallet) => {
        wallets.set(wallet.name, wallet);
        if (wallet.name.toLowerCase().includes("metamask")) {
          window.clearTimeout(timeout);
          window.removeEventListener("wallet-standard:register-wallet", onRegister);
          resolve(wallet);
        }
      } });
    };

    window.addEventListener("wallet-standard:register-wallet", onRegister);
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ConnectedSolanaWallet = {
  address: string;
  walletName: string;
  verifiedAt: number;
};

export async function connectAndVerifyMetaMaskSolana(): Promise<ConnectedSolanaWallet> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("La conexión de wallet requiere un navegador compatible.");
  }

  const wallet = await getMetaMaskWallet();
  const connect = wallet.features["standard:connect"] as ConnectFeature | undefined;
  const signMessage = wallet.features["solana:signMessage"] as SignMessageFeature | undefined;

  if (!connect?.connect || !signMessage?.signMessage) {
    throw new Error("Esta versión de MetaMask no ofrece conexión y firma de mensajes Solana.");
  }

  const { accounts } = await connect.connect();
  const account = accounts.find((item) => item.chains.some((chain) => chain.startsWith("solana:")));
  if (!account || account.publicKey.length !== 32) {
    throw new Error("MetaMask no devolvió una cuenta Solana válida.");
  }

  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
  const issuedAt = new Date().toISOString();
  const message = [
    "SPACE SURVIVORS — Verificación de wallet",
    `Dominio: ${window.location.host}`,
    `Cuenta Solana: ${account.address}`,
    `Nonce: ${nonce}`,
    `Fecha: ${issuedAt}`,
    "Esta firma solo demuestra el control de la cuenta. No autoriza pagos ni transacciones.",
  ].join("\n");
  const messageBytes = new TextEncoder().encode(message);
  const [{ signature }] = await signMessage.signMessage({
    account,
    message: messageBytes,
  });

  const publicKey = await crypto.subtle.importKey(
    "raw",
    account.publicKey,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    signature,
    messageBytes,
  );

  if (!valid) throw new Error("MetaMask devolvió una firma que no pudo verificarse.");

  return {
    address: account.address,
    walletName: wallet.name,
    verifiedAt: Date.now(),
  };
}

export async function disconnectMetaMaskSolana(): Promise<void> {
  const wallet = [...wallets.values()].find((item) =>
    item.name.toLowerCase().includes("metamask"),
  );
  const disconnect = wallet?.features["standard:disconnect"] as
    | { disconnect: () => Promise<void> }
    | undefined;
  await disconnect?.disconnect();
}
