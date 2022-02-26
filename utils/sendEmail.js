require("dotenv").config({ path: "../.env" });
const mailjet = require("node-mailjet").connect(process.env["API_KEY"], process.env["SECRET_KEY"]);

const sendEmail = async (recv, subject, message) => {

    const request = mailjet.post("send", {"version": "v3.1"}).request({
        "Messages": [
            {
                "From": {
                    "Email": "no-reply@bananoplanet.cc",
                    "Name": "BananoPlanet.cc"
                },
                "To": [
                    {
                        "Email": recv
                    }
                ],
                "Subject": subject,
                "TextPart": message
            }
        ]
    });

    // request.then((result) => {
    //     console.log(result.body);
    // }).catch((err) => {
    //     console.log(err.statusCode);
    // });
    
    request.catch((err) => {
        console.error(err);
    });

};

module.exports = sendEmail;