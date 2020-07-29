var Web3 = require("web3");
var Tx = require("ethereumjs-tx");
var mongodb = require("mongodb");
const config = require("./config/config.js");
let database = require("./database");

var etheruem_network = new Web3(global.gConfig.source_network);
var skrumble_network = new Web3(global.gConfig.target_network);
var coldstorage = global.gConfig.coldstorage_address;
var skm_contract_eth_network = global.gConfig.token_contract_on_source_network;
var required_blk_confirmation = global.gConfig.required_blk_confirmations;
var sleep_time = global.gConfig.blk_confirmation_sleep_time;

etheruem_network.eth.net
  .isListening()
  .then(() => console.log("Connected to eth network"))
  .catch(e => {
    console.log("Error!! not connected to eth network");
    process.exit(1);
  });
skrumble_network.eth.net
  .isListening()
  .then(() => console.log("Connected to skrumble network"))
  .catch(e => {
    console.log("Error!! not connected to skrumble network");
    process.exit(1);
  });

console.log("Initiated");
var nonce = 0;
var account = {
  pub: global.gConfig.publickey_with_coins_on_target_network,
  priv: global.gConfig.privatekey_with_coins_on_target_network
};

var total = 0;
//gets nonce for the account thats sending on the target network
async function get_nonce(pubkey) {
  nonce = await skrumble_network.eth.getTransactionCount(pubkey);
}

//get balance from eth address on target network
async function get_from_address(txhash) {
  obj = await skrumble_network.eth.getTransaction(txhash);
  return skrumble_network.utils.fromWei(
    await skrumble_network.eth.getBalance(obj.from),
    "ether"
  );
}

//sets the global variable nonce to the addresses nonce so it can realiably do mass transactions
get_nonce(account.pub);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//waits for token events from parity node
var subscription = etheruem_network.eth
  .subscribe(
    "logs",
    {
      address: skm_contract_eth_network,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      ]
    },
    function() {}
  )
  //waits for the token event to trigger
  .on("data", function(trxData) {
    //gets Transaction Receipt
    etheruem_network.eth.getTransactionReceipt(
      trxData.transactionHash,
      async function(error, reciept) {
        var from_address = "0x" + trxData.topics[1].slice(26);
        var to_address = "0x" + trxData.topics[2].slice(26);
        let eth_confirmd_tx_hash = trxData.transactionHash;
        let confirmed_block_no = trxData.blockNumber;

        if (to_address.toLowerCase() == coldstorage.toLowerCase()) {
          let insertedTxID = database.insertETHTrans(
            to_address,
            coldstorage,
            parseInt(trxData.data),
            eth_confirmd_tx_hash
          );
          var blockConfirmations = required_blk_confirmation;
          var previousBlock = confirmed_block_no;
          while (blockConfirmations > 0) {
            await sleep(sleep_time * 1000);
            etheruem_network.eth.getBlockNumber().then(currentblock => {
              if (previousBlock != currentblock) {
                blockConfirmations--;
                previousBlock = currentblock;
              }
            });
          }

          //Confirm the eth tx in database
          database.updateTxHistory(eth_confirmd_tx_hash, true, "");

          /*
            Check for blacklisted wallet
          */
          database.isWalletinBlackList(to_address.toLowerCase()).then(
            items => {
              if (items) {
                console.log("inside if ");
                database.updateTxHistory(
                  eth_confirmd_tx_hash,
                  true,
                  "BlackListedWallet"
                );
              } else {
                console.log("else ");
                etheruem_network.eth.getTransactionReceipt(
                  eth_confirmd_tx_hash,
                  function(error, reciept2) {
                    let current_confirmed_blk = reciept2.blockNumber;
                    if (current_confirmed_blk == confirmed_block_no) {
                      //generates raw transaction
                      var sender_private_key = new Buffer(account.priv, "hex");
                      var rawTx = {
                        nonce: "0x" + nonce.toString(16),
                        gasPrice: "0x29484e72a000",
                        gasLimit: "0x97120",
                        to: from_address,
                        value: parseInt(trxData.data),
                        data: "0x"
                      };

                      console.log(parseInt(trxData.data));
                      total = total + parseInt(trxData.data);
                      console.log(total);
                      var tx = new Tx(rawTx);

                      //signs raw transaction
                      tx.sign(sender_private_key);

                      //increases nonce so we can do async sends wihtought double nonce sending
                      nonce++;
                      var serializedTx = tx.serialize();
                      
                      //sends signed transaction
                      skrumble_network.eth
                        .sendSignedTransaction(
                          "0x" + serializedTx.toString("hex")
                        )
                        .on("transactionHash", function(hash) {
                          database.updateTxHistory(
                            eth_confirmd_tx_hash,
                            false,
                            hash
                          );
                          console.log(hash);
                        })
                        .on("receipt", function(receipt) {})
                        .on("confirmation", function(
                          confirmation_number,
                          reciept
                        ) {
                          if (confirmation_number == 12) {
                            console.log(reciept);
                            //logs balance
                            get_from_address(reciept.transactionHash).then(
                              function(balance) {
                                //update mainnet tx to db
                                database.updateTxHistory(
                                  eth_confirmd_tx_hash,
                                  true,
                                  reciept.transactionHash
                                );
                                console.log(balance);
                                //print out the total amount of tokens sent
                                console.log("current total");
                                console.log(total);
                              }
                            );
                          }
                        })
                        .on("error", console.error);
                    }
                  }
                );
              }
            },
            reason => {
              console.log("rejected reason: " + reason);
            }
          );
        }
      }
    );
  });
