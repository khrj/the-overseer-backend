const { App } = require("@slack/bolt")

let fetchHistoryQueue = [
    //    [function, params]
]

const app = new App({
    signingSecret: process.env.signing_secret,
    token: process.env.token
})
    ;
(async () => {
    await app.start(process.env.PORT || 3000)
    let channels = []
    let userMap = {}

    async function getChannels(cursor) {
        const conversations = await app.client.conversations.list({
            token: process.env.token,
            limit: 200,
            cursor: cursor
        })

        // @ts-ignore
        conversations.channels.forEach(channel => {
            if (!channel.is_archived) {
                channels.push(channel.id)
            }
        })

        // @ts-ignore
        if (conversations.channels.length > 0 && conversations.response_metadata.next_cursor) {
            await getChannels(conversations.response_metadata.next_cursor)
        }
    }
    await getChannels(undefined)

    async function processQueue() {
        // We're rate limited to 50 requests per minute
        for (let limit = 0; limit < 50; limit++) {
            if (fetchHistoryQueue.length <= 0) {
                console.log("QUEUE OVER :)")

                const sortedValues = Object.entries(userMap).sort(([, a], [, b]) => b - a)
                const top20 = sortedValues.slice(0, 20)

                for ([user, amount] of top20) {
                    try {
                        const response = await app.client.users.info({
                            token: process.env.token,
                            user: user
                        })
                        if (!response.user.real_name || response.user.real_name == "undefined") {
                            console.log(`${user}: ${amount}`)
                        } else {
                            console.log(`${response.user.real_name}: ${amount}`)
                        }
                    } catch (e) {
                        console.log(user, amount, "-- Errored")
                    }
                }

                console.log("ALL ENTRIES:")
                console.dir(sortedValues, { depth: null })

                process.exit(0)
            } else {
                console.log("QUEUE LENGTH: " + fetchHistoryQueue.length)
            }

            const method = fetchHistoryQueue[0][0]
            const params = fetchHistoryQueue[0][1]

            let history 

            try {
                history = await method(params)
            } catch (e) {
                console.log("FAILED: " + params.channel)
                try {
                    await app.client.conversations.join({
                        token: process.env.token,
                        channe: params.channel
                    })
                    history = await method(params)
                } catch (e) {
                    fetchHistoryQueue.shift()
                    continue
                }
            }

            history.messages.forEach(message => {
                if (message.user && message.user !== "undefined") {
                    userMap[message.user] ? userMap[message.user]++ : userMap[message.user] = 1
                }
            })

            if (history.has_more) {
                fetchHistoryQueue.push([app.client.conversations.history, {
                    token: process.env.token,
                    channel: params.channel,
                    cursor: history.response_metadata.next_cursor,
                    limit: 1000,
                    // Epoch time of 30 day prior date, in seconds
                    oldest: ((new Date().getTime() - (30 * 24 * 60 * 60 * 1000)) / 1000).toString()
                }])
            }

            fetchHistoryQueue.shift()
        }
    }

    function addLast30DaysAnalytics(channel) {
        fetchHistoryQueue.push([app.client.conversations.history, {
            token: process.env.token,
            channel: channel,
            limit: 1000,
            // Epoch time of 30 day prior date, in seconds
            oldest: ((new Date().getTime() - (30 * 24 * 60 * 60 * 1000)) / 1000).toString()
        }])
    }

    channels.forEach(channel => {
        addLast30DaysAnalytics(channel)
    })

    processQueue()
    setInterval(processQueue, 60 * 1000)
})()

// import { App } from "@slack/bolt"
// import { readFileSync } from 'fs'
// const sleepSynchronously = require('sleep-synchronously')

// const app = new App({
//     signingSecret: process.env.signing_secret,
//     token: process.env.token
// })

// const channels = readFileSync('channelsNew.txt', 'utf8').split(/\r?\n/)

// app.start(process.env.PORT || 3000).then(() => {
//     let counter = 0
//     channels.forEach((channel) => {
//         app.client.conversations.join({
//             token: process.env.token,
//             channel: channel
//         }).then(() => {
//             console.log(`${counter}: ${channel}`)
//             counter++
//             if (counter > 50) {
//                 sleepSynchronously(60000)
//                 counter = 0
//             }
//         })
//     })
//     console.log("DONE :)")
// }