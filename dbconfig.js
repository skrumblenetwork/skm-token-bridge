var version="_Dev2";

//Database name
var databaseName = "SkrumbleTokenSwapDB"+version;

//Collection of User address and generated wallets with private key
var dbKeysCollection = "keysCollection";

//Collection mapping of useraddress and parking wallet address
var dbCollectionName = "AddressMapping";

//Collection of all the transaction details of token swap
var dbTxCollection = "txDetails";

var dbWalletBlackList = "walletBlackList";

var dbtest = "test";

//const dbURL = await MongoClient.connect('mongodb://adminUsername:adminPassword@localhost:27017/mydb?authSource=admin');
var dbURL = "mongodb://localhost:27017";


module.exports = {databaseName: databaseName, dbCollectionName: dbCollectionName, dbURL:dbURL, dbKeysCollection:dbKeysCollection, dbTxCollection:dbTxCollection, dbWalletBlackList:dbWalletBlackList, dbtest:dbtest};