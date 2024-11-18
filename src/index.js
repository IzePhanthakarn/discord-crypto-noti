const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const axios = require('axios');
const cron = require('cron');
require('dotenv').config();

// 🤖 Discord Bot Configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 📊 Tracked Tokens List
const tokenList = [];

// 🎮 Bot Slash Commands
const commands = [
    {
        name: "add",
        description: "📈 เพิ่มเหรียญเพื่อติดตาม",
        options: [{
            name: "coin",
            type: 3,  // STRING type
            description: "ชื่อเหรียญที่ต้องการติดตาม",
            required: true,
        }],
    },
    {
        name: "remove",
        description: "📉 ลบเหรียญออกจากการติดตาม",
        options: [{
            name: "coin",
            type: 3,  // STRING type
            description: "ชื่อเหรียญที่ต้องการลบ",
            required: true,
        }],
    },
    {
        name: "check",
        description: "📋 ตรวจสอบรายการเหรียญที่ติดตาม",
    },
    {
        name: "price",
        description: "💰 เช็คราคาเหรียญ",
        options: [{
            name: "coin",
            type: 3,  // STRING type
            description: "เหรียญที่ต้องการตรวจสอบ (เว้นว่างเพื่อดูทั้งหมด)",
            required: false,
        }],
    },
];

// 🚀 Register Slash Commands
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('🔄 Started updating application (/) commands.');

        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
            body: commands,
        });

        console.log('✅ Successfully updated application (/) commands.');
    } catch (error) {
        console.error('❌ Failed to update application (/) commands:', error);
    }
})();

// 🔍 Fetch Coin Price from CoinGecko
async function getCoinPrice(coin) {
    try {
        const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coin}`);
        const { current_price: { usd: price }, price_change_percentage_24h: change24h } = response.data.market_data;
        return { price, change24h };
    } catch (error) {
        console.error(`❌ ไม่สามารถดึงราคา ${coin} ได้:`, error);
        return null;
    }
}

// 📊 Check Prices for All Tracked Tokens
async function checkAllPrices(isDaily = false) {
    if (tokenList.length === 0) {
        return '🚫 ไม่มีเหรียญในรายการ';
    }

    let result = "";
    if (!isDaily) result += '💰 **ราคาปัจจุบันของเหรียญในรายการ:**\n';

    for (const coin of tokenList) {
        const data = await getCoinPrice(coin);
        if (data) {
            const trendEmoji = data.change24h >= 0 ? '📈' : '📉';
            const price = data.price < 0.1 ? data.price.toFixed(8) : data.price.toFixed(2);
            const change24h = data.change24h >= 0
                ? `+${data.change24h.toFixed(2)}`
                : data.change24h.toFixed(2);

            result += `- **${coin.toUpperCase()}**: $${price} ${trendEmoji} (เปลี่ยนแปลง: ${change24h}%)\n`;
        } else {
            result += `${coin.toUpperCase()} - ❌ ไม่สามารถดึงข้อมูลได้\n`;
        }
    }

    return result;
}

// 🔧 Command Handlers
async function addCoin(coinName, interaction) {
    const coin = coinName.toLowerCase();
    if (!tokenList.includes(coin)) {
        tokenList.push(coin);
        await interaction.reply(`✅ เพิ่มเหรียญ **${coin.toUpperCase()}** สำเร็จ!`);
    } else {
        await interaction.reply(`🚨 เหรียญ **${coin.toUpperCase()}** มีอยู่ในรายการแล้ว!`);
    }
}

async function removeCoin(coinName, interaction) {
    const coin = coinName.toLowerCase();
    const index = tokenList.indexOf(coin);
    if (index > -1) {
        tokenList.splice(index, 1);
        await interaction.reply(`❌ ลบเหรียญ ${coin.toUpperCase()} ออกจากรายการสำเร็จ`);
    } else {
        await interaction.reply(`🚫 เหรียญ ${coin.toUpperCase()} ไม่ได้อยู่ในรายการติดตาม`);
    }
}

async function checkCoins(interaction) {
    if (tokenList.length === 0) {
        await interaction.reply('🚫 ไม่มีเหรียญในรายการ');
    } else {
        const trackingList = tokenList.join(', ').toUpperCase();
        await interaction.reply(`📋 กำลังติดตาม: ${trackingList}`);
    }
}

async function getPrice(coinName, interaction) {
    const coin = coinName ? coinName.toLowerCase() : null;

    if (coin) {
        const data = await getCoinPrice(coin);

        if (data) {
            const trendEmoji = data.change24h >= 0 ? '📈' : '📉';
            const price = data.price < 0.1 ? data.price.toFixed(8) : data.price.toFixed(2);
            const change24h = data.change24h >= 0
                ? `+${data.change24h.toFixed(2)}`
                : data.change24h.toFixed(2);

            await interaction.reply(
                `- **${coin.toUpperCase()}**: $${price} ${trendEmoji} (เปลี่ยนแปลง: ${change24h}%)`
            );
        } else {
            await interaction.reply(`❌ ไม่สามารถดึงข้อมูลสำหรับ ${coin} ได้`);
        }
    } else {
        const allPrices = await checkAllPrices();
        await interaction.reply(allPrices);
    }
}

// ⏰ Daily Price Update Cron Job
const job = new cron.CronJob('0 9 * * *', async () => {
    if (tokenList.length === 0) {
        console.log('🚫 ไม่มีเหรียญในรายการ');
        return;
    }

    const allPrices = await checkAllPrices(true);
    client.channels.cache.get(process.env.CHANNEL_ID).send(`📊 ราคาเหรียญประจำวัน:\n${allPrices}`);
}, null, true, 'Asia/Bangkok');

// 🌟 Bot Events
client.once('ready', () => {
    console.log(`✅ Logged in as: ${client.user.tag}!`);
    job.start();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const coinName = interaction.options.getString('coin');

    const commands = {
        'add': () => addCoin(coinName, interaction),
        'remove': () => removeCoin(coinName, interaction),
        'check': () => checkCoins(interaction),
        'price': () => getPrice(coinName, interaction)
    };

    commands[commandName] && await commands[commandName]();
});

client.login(process.env.BOT_TOKEN);