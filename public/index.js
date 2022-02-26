async function postData(url = "", data = {}) {
    const response = await fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors', // no-cors, *cors, same-origin
        cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
        credentials: 'same-origin', // include, *same-origin, omit
        headers: {
            'Content-Type': 'application/json'
        },
        redirect: 'follow', // manual, *follow, error
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        body: JSON.stringify(data) // body data type must match "Content-Type" header
    });
    return response.json(); // parses JSON response into native JavaScript objects
}

async function buy(productID) {
    let orderInfo = await postData("/order", {
        "product_id": productID,
        "return_address": document.getElementById("return_address").value,
        "email_address": document.getElementById("email_address").value
    });
    console.log(orderInfo);
    window.location.href = `/invoice/${orderInfo["order"]["order_id"]}`;
}

async function generateQR(text) {
    new QRCode(document.getElementById("qrcode"), text);
}