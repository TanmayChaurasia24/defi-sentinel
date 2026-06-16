import {
  CasperClient,
  Contracts,
  Keys,
  RuntimeArgs,
  DeployUtil
} from "casper-js-sdk";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// Default to testnet, but allow overriding via command line
const isMainnet = process.argv.includes("--mainnet");

const NODE_URL = isMainnet 
  ? "https://node.cspr.cloud/rpc" 
  : "https://node.testnet.cspr.cloud/rpc";

const CSPR_CLOUD_TOKEN = process.env.CSPR_CLOUD_TOKEN;

if (!CSPR_CLOUD_TOKEN) {
  console.error("❌  Missing CSPR_CLOUD_TOKEN in .env file");
  console.error("    Please add it to agent/.env and try again.");
  process.exit(1);
}

const WASM_PATH = path.resolve(__dirname, "../../contracts/wasm/SentinelContract.wasm");
const KEY_PATH = path.resolve(__dirname, "../../contracts/keys/secret_key.pem");
const NETWORK_NAME = isMainnet ? "casper" : "casper-test";
// 150 CSPR for contract deployment
const PAYMENT_AMOUNT = "150000000000";

async function deploy() {
  console.log(`🔍  Checking files for deployment to ${NETWORK_NAME.toUpperCase()}...`);
  if (!fs.existsSync(WASM_PATH)) {
    console.error(`❌  WASM not found at: ${WASM_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`❌  Key not found at: ${KEY_PATH}`);
    process.exit(1);
  }

  if (isMainnet) {
    console.warn("⚠️   WARNING: Deploying to MAINNET. This will cost real CSPR.");
  }

  console.log("🔑  Loading keys...");
  let keyPair: Keys.AsymmetricKey;
  try {
    keyPair = Keys.Ed25519.loadKeyPairFromPrivateFile(KEY_PATH);
  } catch (e) {
    try {
      keyPair = Keys.Secp256K1.loadKeyPairFromPrivateFile(KEY_PATH);
    } catch (e2) {
      console.error("❌  Failed to parse key file. Ensure it is a valid PEM.");
      process.exit(1);
    }
  }

  console.log("🔨  Constructing Deploy...");
  const casperClient = new CasperClient(NODE_URL);
  const wasm = new Uint8Array(fs.readFileSync(WASM_PATH));
  const args = RuntimeArgs.fromMap({});

  const contract = new Contracts.Contract(casperClient);

  const deploy = contract.install(
    wasm,
    args,
    PAYMENT_AMOUNT,
    keyPair.publicKey,
    NETWORK_NAME,
    [keyPair]
  );

  console.log(`🌐  Sending Deploy to ${NETWORK_NAME} via CSPR.cloud (Authenticated)...`);
  try {
    const deployJson = DeployUtil.deployToJson(deploy);
    
    // deployToJson returns { deploy: {...} } in casper-js-sdk v2
    // The RPC params for account_put_deploy expect the deploy object directly
    const deployPayload = (deployJson as any).deploy ? deployJson : { deploy: deployJson };
    
    // Broadcast the deploy using Axios directly so we can attach custom Authorization headers
    const response = await axios.post(
      NODE_URL,
      {
        id: 1,
        jsonrpc: "2.0",
        method: "account_put_deploy",
        params: deployPayload
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": CSPR_CLOUD_TOKEN!
        }
      }
    );

    if (response.data.error) {
      console.error("❌  Deploy failed on node:", response.data.error.message || response.data.error);
      return;
    }

    const deployHash = response.data.result.deploy_hash;
    console.log("✅  Deploy successfully submitted!");
    console.log(`    Deploy Hash: ${deployHash}`);
    console.log("");
    console.log("⏳  You can check its status on cspr.live:");
    if (isMainnet) {
      console.log(`    https://cspr.live/deploy/${deployHash}`);
    } else {
      console.log(`    https://testnet.cspr.live/deploy/${deployHash}`);
    }
    console.log("");
    console.log("    Once it succeeds, find the contract hash in your account named keys.");
  } catch (error: any) {
    console.error("❌  Deploy failed:", error?.response?.data || error.message);
  }
}

deploy();
