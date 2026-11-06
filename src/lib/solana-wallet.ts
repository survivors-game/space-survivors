type SolanaAccount = {
  address: string;
  publicKey: Uint8Array;
  chains: string[];
};

type SolanaWallet = {
  name: string;
  features: Record<string, unknown>;
};

type ConnectFeature = {
  connect: () => Promise<{ accounts: SolanaAccount[] }>;
};

type SignMessageFeature = {
  signMessage: (input: {
    account: SolanaAccount;
    message: Uint8Array;
  }) => Promise<Array<{ signature: Uint8Array }>>;
};

type MetaMaskSolanaClient = {
  getWallet: () => SolanaWallet;
  disconnect: () => Promise<void>;
};

type MetaMaskSolanaSdk = {
  createSolanaClient: (options: {
    dapp: { name: string; url: string };
  }) => Promise<MetaMaskSolanaClient>;
};

let clientPromise: Promise<MetaMaskSolanaClient> | undefined;

// Pinned SDK release. It registers MetaMask as a Solana Wallet Standard wallet.
const METAMASK_SOLANA_SDK_URL =
  "https://esm.sh/@metamask/connect-solana@2.1.1?bundle";

async function getMetaMaskClient(): Promise<MetaMaskSolanaClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const sdk = (await import(/* @vite-ignore */ METAMASK_SOLANA_SDK_URL)) as MetaMaskSolanaSdk;
      return sdk.createSolanaClient({
        dapp: {
          name: "SPACE SURVIVORS",
          url: window.location.origin,
        },
      });
    })().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
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

  const client = await getMetaMaskClient();
  const wallet = client.getWallet();
  const connect = wallet.features["standard:connect"] as ConnectFeature | undefined;
  const signMessage = wallet.features["solana:signMessage"] as SignMessageFeature | undefined;

  if (!connect?.connect || !signMessage?.signMessage) {
    throw new Error("MetaMask no ofrece las funciones necesarias para conectar y firmar en Solana.");
  }

  const { accounts } = await connect.connect();
  const account = accounts.find((item) =>
    item.chains.some((chain) => chain.startsWith("solana:")),
  );
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

  if (!valid) throw new Error("La firma de MetaMask no pudo verificarse.");

  return {
    address: account.address,
    walletName: wallet.name,
    verifiedAt: Date.now(),
  };
}

export async function disconnectMetaMaskSolana(): Promise<void> {
  const client = await getMetaMaskClient();
  await client.disconnect();
}
