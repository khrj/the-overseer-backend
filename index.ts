import { WebClient } from "@slack/web-api"
import { writeFileSync } from "fs"
import { PrismaClient, Status } from "@prisma/client"
const prisma = new PrismaClient()

// Every element: [function, params]
let fetchHistoryQueue = []
let fetchReplyQueue = []

const slack = new WebClient(process.env.TOKEN)

async function main() {
    let channels = []
    let userMap = {}

    async function isValidChannel(channel: string) {
        const response = await prisma.channel.upsert({
            where: { id: channel },
            create: {
                id: channel,
                status: Status.UNREVIEWED
            },
            update: {}
        })

        switch (response.status) {
            case Status.APPROVED:
                console.log("APPROVED: " + channel)
                return true
    
            case Status.REJECTED:
                console.log("EXPLICITLY REJECTED: " + channel)
                return false
            
            case Status.UNREVIEWED:
                console.log("IMPLICITLY REJECTED: " + channel)
                return false
        }
    }

    async function getChannels(cursor: string) {
        const conversations: any = await slack.conversations.list({
            limit: 200,
            cursor: cursor
        })

        for (const channel of conversations.channels) {
            if (!channel.is_archived) {
                const valid = await isValidChannel(channel.id)
                if (valid) {
                    channels.push(channel.id)
                }
            }
        }

        if (conversations.channels.length > 0 && conversations.response_metadata.next_cursor) {
            await getChannels(conversations.response_metadata.next_cursor)
        }
    }
    await getChannels(undefined)

    async function processMessageQueue() {
        // We're rate limited to 50 requests per minute
        for (let limit = 0; limit < 50; limit++) {
            if (fetchHistoryQueue.length <= 0) {
                clearInterval(messageQueueMonitor)
                clearInterval(replyQueueMonitor)
                console.log("MESSAGE QUEUE OVER :)")

                // Buffer for a minute to make sure reply queue timeout is over
                await sleep(60 * 1000)

                // Complete reply queue
                while (fetchReplyQueue.length > 0) {
                    await processReplyQueue()
                    await sleep(60 * 1000)
                }

                // @ts-ignore
                const sortedValues = Object.entries(userMap).sort(([, a], [, b]) => b - a)
                const top20 = sortedValues.slice(0, 20)

                let namedTop20 = []

                for (const [user, amount] of top20) {
                    try {
                        const response: any = await slack.users.info({
                            user: user,
                        })

                        if (!response.user.real_name || response.user.real_name == "undefined") {
                            namedTop20.push([user, amount])
                            console.log(`${user}: ${amount}`)
                        } else {
                            namedTop20.push([response.user.real_name, amount])
                            console.log(`${response.user.real_name}: ${amount}`)
                        }
                    } catch (e) {
                        console.log(user, amount, "-- Errored")
                    }
                }

                writeFileSync("20.json", JSON.stringify(namedTop20))

                console.log("ALL ENTRIES:")
                console.dir(sortedValues, { depth: null })

                writeFileSync("results.json", JSON.stringify(sortedValues))

                process.exit(0)
            } else {
                console.log("QUEUE LENGTH: " + fetchHistoryQueue.length)
            }

            const method = fetchHistoryQueue[0][0]
            const params = fetchHistoryQueue[0][1]

            let history: any

            try {
                history = await method(params)
            } catch (e) {
                console.log("FAILED: " + params.channel)
                try {
                    await slack.conversations.join({
                        channel: params.channel
                    })
                    history = await method(params)
                } catch (e) {
                    fetchHistoryQueue.shift()
                    continue
                }
            }

            history.messages.forEach((message: any) => {
                if (message.user && message.user !== "undefined") {
                    userMap[message.user] ? userMap[message.user]++ : userMap[message.user] = 1
                }

                // The reply_count property is only present on messages that have replies. 
                // Compare the ts to the thread_ts to make sure we only count replies from a thread's parent message
                if (message.reply_count && message.ts == message.thread_ts) {
                    fetchReplyQueue.push([slack.conversations.replies, {
                        channel: params.channel,
                        ts: message.thread_ts,
                        limit: message.reply_count,
                    }])
                }
            })

            if (history.has_more) {
                fetchHistoryQueue.push([slack.conversations.history, {
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

    async function processReplyQueue() {
        // We're rate limited to 50 requests per minute
        for (let limit = 0; limit < 50; limit++) {
            if (fetchReplyQueue.length <= 0) {
                console.log("Reply queue empty, waiting for further messages")
                break
            } else {
                console.log("REPLY QUEUE LENGTH: " + fetchReplyQueue.length)
            }

            const method = fetchReplyQueue[0][0]
            const params = fetchReplyQueue[0][1]

            let history: any

            try {
                history = await method(params)
            } catch (e) {
                console.log("FAILED: " + params.channel)
                try {
                    await slack.conversations.join({
                        channel: params.channel
                    })
                    history = await method(params)
                } catch (e) {
                    fetchReplyQueue.shift()
                    continue
                }
            }

            history.messages.forEach((message: any) => {
                if (message.user && message.user !== "undefined") {
                    userMap[message.user] ? userMap[message.user]++ : userMap[message.user] = 1
                }
            })

            fetchReplyQueue.shift()
        }
    }

    channels.forEach(channel => {
        fetchHistoryQueue.push([slack.conversations.history, {
            channel: channel,
            limit: 1000,
            // Epoch time of 30 day prior date, in seconds
            oldest: ((new Date().getTime() - (30 * 24 * 60 * 60 * 1000)) / 1000).toString()
        }])
    })

    processMessageQueue()
    const messageQueueMonitor = setInterval(processMessageQueue, 60 * 1000)

    processReplyQueue()
    const replyQueueMonitor = setInterval(processReplyQueue, 60 * 1000)
}

async function sleep(time: number) {
    await new Promise(resolve => {
        setTimeout(resolve, time)
    })
}

main()