import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URL = 'https://node.testnet.cspr.cloud/rpc';
const TOKEN = process.env.CSPR_CLOUD_TOKEN ?? process.env.CSPR_CLOUD_API_KEY;
const DEPLOY_HASH = '124937b7fdbda4e2ff5fe4fbca6c4934f27340bddc1c71a050a1e9203a4dcc58';

async function checkDeploy() {
  console.log('🔍 Checking deploy status...');
  
  try {
    const response = await axios.post(RPC_URL, {
      id: 1,
      jsonrpc: '2.0',
      method: 'info_get_deploy',
      params: { deploy_hash: DEPLOY_HASH }
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: TOKEN!
      },
      timeout: 15000
    });

    const result = response.data.result;
    const execResults = result?.execution_results;

    if (execResults && execResults.length > 0) {
      const er = execResults[0].result;
      if (er.Success) {
        console.log('✅ Deploy SUCCEEDED');
        console.log('Cost:', er.Success.cost, 'motes');
        
        // Look for named keys transforms
        const transforms = er.Success.effect?.transforms ?? [];
        for (const t of transforms) {
          const write = t.transform?.WriteNamedKey ?? t.transform?.WriteCLValue;
          if (write) {
            console.log('Transform:', JSON.stringify(t.key).slice(0, 80));
          }
        }
      } else if (er.Failure) {
        console.log('❌ Deploy FAILED:', er.Failure.error_message);
      }
    } else {
      console.log('⏳ No execution results yet — deploy may still be pending');
    }

    // Now get the account hash from the deploy header
    const header = result?.deploy?.header;
    if (header) {
      const accountPublicKey = header.account;
      console.log('\n🔑 Account public key:', accountPublicKey);
      
      // Query global state for the named keys
      console.log('\n🔍 Querying account named keys...');
      const stateRes = await axios.post(RPC_URL, {
        id: 2,
        jsonrpc: '2.0',
        method: 'state_get_account_info',
        params: { public_key: accountPublicKey }
      }, {
        headers: { 'Content-Type': 'application/json', Authorization: TOKEN! },
        timeout: 15000
      });
      
      const namedKeys = stateRes.data.result?.account?.named_keys ?? [];
      console.log(`Found ${namedKeys.length} named keys:`);
      for (const nk of namedKeys) {
        console.log(`  ${nk.name} = ${nk.key}`);
      }
      
      // Find the contract hash
      const contractEntry = namedKeys.find((nk: any) => 
        nk.name.includes('contract_hash') || nk.name.includes('sentinel')
      );
      if (contractEntry) {
        console.log(`\n🎯 CONTRACT HASH: ${contractEntry.key}`);
        console.log(`\n📋 Add this to your .env:`);
        console.log(`   SENTINEL_CONTRACT_HASH=${contractEntry.key.replace('hash-', '')}`);
      }
    }
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
}

checkDeploy();
