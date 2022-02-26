require("dotenv").config();

const express = require("express");
const axios = require("axios");
const Database = require("simplest.db");
const bananojs = require("bananojs");
const http = require("http");
const https = require("https");

const bananoTools = require("./utils/bananoTools.js");
const sendEmail = require("./utils/sendEmail.js");

const stockDB = new Database({
    path: "./stock.json"
});

const invoicesDB = new Database({
    path: "./invoices.json"
});

let banusd;
axios("https://api.coingecko.com/api/v3/simple/price?ids=banano&vs_currencies=usd").then(res => {
    banusd = res.data["banano"]["usd"];
});
setInterval(() => {
    try {
        axios("https://api.coingecko.com/api/v3/simple/price?ids=banano&vs_currencies=usd").then(res => {
            banusd = res.data["banano"]["usd"];
        });
    } catch(err) {
        console.error(err);
    };
}, 60000);

bananojs.bananodeApi.setUrl(process.env["HTTP_NODE"]);

const app = express();
const port = process.env.PORT || 8080;

app.enable("trust proxy");
app.use(express.static(__dirname + "/public"));
app.set(`view engine`, `ejs`)

if (process.env.USE_SSL == "true") {
    const privateKey = fs.readFileSync(process.env.SSL_KEY_PATH, `utf8`);
    const certificate = fs.readFileSync(process.env.SSL_CRT_PATH, `utf8`);
    const credentials = {
        key: privateKey,
        cert: certificate
    };
    let httpServer = http.createServer(app);
    let httpsServer = https.createServer(credentials, app);
    httpServer.listen(8080)
    httpsServer.listen(443)
}

app.use(express.json()); // to support JSON-encoded bodies
app.use(express.urlencoded({ extended: true })); // to support URL-encoded bodies

// Add headers before the routes are defined
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.use((err, req, res, next) => {
    console.error(err);
    if (err) {
        res.json({
            "status": 500,
            "message": "Internal server error"
        });
    } else { next() };
})

app.get(`/`, (req, res) => {

    let stockJSON = JSON.parse(stockDB.toJSON());
    Object.keys(stockJSON).forEach(pID => {
        stockJSON[pID]["stock"] = stockJSON[pID]["stock"].length;
        stockJSON[pID]["id"] = pID;
    });

    res.render("index", {
        productList: JSON.stringify(stockJSON)
    });

})

app.get(`/info/:product_id`, (req, res) => {

    let productInfo = stockDB.get(req.params["product_id"]);
    if (!productInfo) return res.json({
        "status": 200,
        "message": "Product not found"
    });
    productInfo["stock"] = productInfo["stock"].length;
    productInfo["price"] = parseFloat((productInfo["price_usd"] / banusd).toFixed(2));    
    productInfo["id"] = req.params["product_id"]; 
    res.render("orderProduct", {
        productInfo: productInfo
    });

})

app.get(`/invoice/:order_id`, async (req, res) => {

    let orderInfo = invoicesDB.get(req.params["order_id"].toString());
    if (!orderInfo) return res.json({
        "status": 200,
        "message": "Invoice not found"
    });
    orderInfo["private_key"] = undefined;
    orderInfo["email"] = undefined;
    orderInfo["return_address"] = undefined;
    res.render("invoice", {
        orderInfo: JSON.stringify(orderInfo)
    });

})

app.post(`/order`, async (req, res) => {
    if ([
        req.body["product_id"],
        req.body["return_address"],
        req.body["email_address"]
    ].includes(undefined)) {
        res.json({
            "status": 400,
            "message": "Bad request"
        });
    } else {

        let stockJSON = JSON.parse(stockDB.toJSON());
        if (!Object.keys(stockJSON).includes(req.body["product_id"])) return res.json({
            "status": 200,
            "message": "Product not found"
        });
        if (stockJSON[req.body["product_id"]]["stock"].length == 0) return res.json({
            "status": 200,
            "message": "Product out of stock"
        });

        let orderID = invoicesDB.get("last_invoice") + 1;
        let privkey = bananoTools.generatePrivateKey(orderID);
        let payment_address = await bananoTools.getAccountFromPrivateKey(privkey);

        let orderInfo = {
            order_id: orderID,
            product_id: req.body["product_id"],
            timestamp: Date.now(),
            value_usd: stockJSON[req.body["product_id"]]["price_usd"],
            value: parseFloat((stockJSON[req.body["product_id"]]["price_usd"] / banusd).toFixed(2)),
            email: req.body["email_address"],
            expiry: Date.now() + 3600000,
            private_key: privkey,
            payment_address: payment_address,
            return_address: req.body["return_address"],
            status: "OUTSTANDING",
        };

        invoicesDB.set("last_invoice", orderInfo.order_id);
        invoicesDB.set(orderID.toString(), orderInfo);

        orderInfo.private_key = undefined;

        res.json({
            "status": 200,
            "order": orderInfo
        });

        const checkForPayment = async () => {
            await bananoTools.receivePending(orderInfo.order_id);
            let paid_balance = await bananoTools.getBalance(payment_address);
            if (parseFloat(paid_balance["balance_decimal"]) >= orderInfo.value && stockJSON[req.body["product_id"]]["stock"].length > 0) {
                
                // move funds to master wallet
                await bananoTools.flushBan(paid_balance["balance"], orderID);

                let returnable = stockJSON[req.body["product_id"]]["stock"][0];
                stockDB.set(`${req.body["product_id"]}.stock`, stockJSON[req.body["product_id"]]["stock"].filter(s => s != returnable));        

                // email the buyer their product and invoice summary
                try {
                    await sendEmail(orderInfo.email, `Order #${orderInfo.order_id} - Payment successful`,
                        [
                            `Hello,`,
                            `Your payment for order #${orderInfo.order_id} has come through. You can find your order details below:`,
                            ``,
                            `${stockJSON[orderInfo.product_id]["name"]}: ${returnable}`,
                            `Price: ${orderInfo["value"].toFixed(2)} BAN`,
                            ``,
                            `You can contact us on Discord for further assistance: https://bananoplanet.cc/discord`,
                            ``,
                            `Kind Regards`,
                            `BananoPlanet.cc`
                        ].join(`\n`)
                    );
                    invoicesDB.set(`${orderInfo.order_id}.status`, `DELIVERED`);
                } catch(err) {
                    console.error(err);
                    invoicesDB.set(`${orderInfo.order_id}.status`, `PAID`);
                };

            } else {
                if (Date.now() > orderInfo["expiry"]) {
                    if (paid_balance["balance_decimal"] != "0.0") {
                        try {
                            await bananoTools.flushBan(paid_balance["balance"], orderID, orderInfo["return_address"]);
                        } catch(err) {
                            console.error(err);
                            await bananoTools.flushBan(paid_balance["balance"], orderID);
                        };
                    };
                    invoicesDB.set(`${orderInfo.order_id}.status`, `EXPIRED`);
                    try {
                        await sendEmail(orderInfo.email, `Order #${orderInfo.order_id} - Expired`,
                            [
                                `Hello,`,
                                `Regarding your order - #${orderInfo.order_id} (${stockJSON[orderInfo.product_id]["name"]}) - we didn't receive sufficient payment in time. As a result, your order has expired.`,
                                ``,
                                `You can contact us on Discord for further assistance: https://bananoplanet.cc/discord`,
                                ``,
                                `Kind Regards`,
                                `BananoPlanet.cc`
                            ].join(`\n`)
                        );
                    } catch(err) {
                        console.error(err);
                    };
                } else {
                    setTimeout(checkForPayment, 30000);
                }
            }
        };

        checkForPayment();
    
    };
})

app.get(`/product/:product_id`, async (req, res) => {

    let productInfo = stockDB.get(req.params["product_id"]);
    if (!productInfo) return res.json({
        "status": 404,
        "message": "Product not found"
    });
    productInfo["stock"] = productInfo["stock"].length;
    productInfo["price"] = parseFloat((productInfo["price_usd"] / banusd).toFixed(2));
    productInfo["id"] = req.params["product_id"]; 
    res.json({
        "status": 200,
        "product": productInfo
    });

})

app.get(`/product_list`, async (req, res) => {

    let stockJSON = JSON.parse(stockDB.toJSON());
    Object.keys(stockJSON).forEach(pID => {
        stockJSON[pID]["stock"] = stockJSON[pID]["stock"].length;
        stockJSON[pID]["id"] = pID;
    });

    res.json({
        "status": 200,
        "product_list": stockJSON
    });

})

app.all('*', function(req, res, next) {
    res.json({
        "status": 404,
        "message": "Page not found"
    });
})

app.use(function (req, res, next) {
    res.json({
        "status": 404,
        "message": "Page not found"
    });
})

app.use(function (err, req, res, next) {
    console.error(err.stack);
})

app.listen(port, () => {
    console.log(`UI is live! http://localhost:${port}`);
})