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
const METAMASK_SOLANA_SDK_URL =
  "https://esm.sh/@metamask/connect-solana@2.1.1?bundle";

async function getMetaMaskClient(): Promise<MetaMaskSolanaClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const sdk = (await import(/* @vite-ignore */ METAMASK_SOLANA_SDK_URL)) as MetaMaskSolanaSdk;
      return sdk.createSolanaClient({
        dapp: { name: "SPACE SURVIVORS", url: window.location.origin },
      });
    })().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo completar la autenticación.");
  }
  return payload;
}

export type ConnectedSolanaWallet = {
  address: string;
  walletName: string;
  verifiedAt: number;
};

export async function getAuthenticatedSolanaWallet(): Promise<ConnectedSolanaWallet | null> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const result = await readApiResponse<{
    authenticated: boolean;
    address?: string;
  }>(response);
  return result.authenticated && result.address
    ? { address: result.address, walletName: "MetaMask", verifiedAt: Date.now() }
    : null;
}

export async function connectAndVerifyMetaMaskSolana(): Promise<ConnectedSolanaWallet> {
  if (typeof window === "undefined") {
    throw new Error("La conexión de wallet requiere un navegador.");
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

  const challengeResponse = await fetch("/api/auth/challenge", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: account.address }),
  });
  const challenge = await readApiResponse<{
    challengeId: string;
    message: string;
  }>(challengeResponse);

  const [{ signature }] = await signMessage.signMessage({
    account,
    message: new TextEncoder().encode(challenge.message),
  });
  const signatureBase64 = btoa(
    Array.from(signature, (byte) => String.fromCharCode(byte)).join(""),
  );

  const verifyResponse = await fetch("/api/auth/verify", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      address: account.address,
      signature: signatureBase64,
    }),
  });
  await readApiResponse<{ authenticated: boolean }>(verifyResponse);

  return {
    address: account.address,
    walletName: wallet.name,
    verifiedAt: Date.now(),
  };
}

export async function disconnectMetaMaskSolana(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  await readApiResponse<{ authenticated: boolean }>(response);
  if (clientPromise) {
    const client = await clientPromise;
    await client.disconnect();
  }
}
