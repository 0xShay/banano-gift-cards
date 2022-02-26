require("dotenv").config({ path: "../.env" });

const bananojs = require("bananojs");
const axios = require("axios");
bananojs.bananodeApi.setUrl(process.env["HTTP_NODE"]);

let masterAccount;

let bananoTools = {};

bananoTools.generatePrivateKey = (index) => {
    
    return bananojs.getPrivateKey(process.env["WALLET_SEED"], index);

}

bananoTools.getAccountFromPrivateKey = async (pk) => {

    let publicKey = await bananojs.getPublicKey(pk);
    return bananojs.getBananoAccount(publicKey);

}

bananoTools.getBalance = async (account) => {
    let toReturn = {};
    await axios.post(process.env["HTTP_NODE"], {  
        "action": "account_balance",
        "account": account
    })
    .then(res => {
        toReturn = res.data;
    })
    .catch(err => console.log(err));
    return toReturn;
}

bananoTools.receivePending = async (pkI=0) => {
    const txList = await bananojs.receiveBananoDepositsForSeed(process.env["WALLET_SEED"], pkI, process.env["REP_ACCOUNT"]);
    return txList;
}

bananoTools.flushBan = async (amountRaw, pkI=0, destAccount=masterAccount) => {
    let response = "";
    response = await bananojs.bananoUtil.sendFromPrivateKey(
        bananojs.bananodeApi,
        bananojs.getPrivateKey(process.env["WALLET_SEED"], pkI),
        destAccount,
        amountRaw,
        `ban_`
    );
    console.log(`flush successful: (${(amountRaw / 1e29).toFixed(8)} BAN)`, response);
    return response;
}

bananoTools.getAccountFromPrivateKey(bananoTools.generatePrivateKey(0)).then(res => {
    masterAccount = res;
});

module.exports = bananoTools;