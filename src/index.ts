import { App } from "@slack/bolt"

const app = new App({
    signingSecret: process.env.signing_secret,
    token: process.env.token
})

;(async () => {
    let channels = []

    await app.start(process.env.PORT || 3000)
    const conversations = await app.client.conversations.list({
        token: process.env.token,
        limit: 1000
    })

    //@ts-ignore
    conversations.channels.forEach(channel =>  {
        channels.push(channel.id)
    })

    var fs = require('fs');

    var file = fs.createWriteStream('array.txt');

    channels.forEach(function (v) { file.write(`${v}\n`) })
    file.end();

})()