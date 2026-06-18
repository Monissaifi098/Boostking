const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  BOT_TOKEN: "8177745339:AAHNvkhh7_IgW9P2tIQt5tvXD_zwVAErR5g",
  ADMIN_ID: "6270522295",
  FIREBASE_URL: "https://boostking-8b27b-default-rtdb.firebaseio.com",
  FIREBASE_SECRET: "mCxWplGD1C5y7Xcdt4BKDxv6N5TnW12jEaCvJuk1",
  UPI_ID: "monisbhai@fam",
  BOT_NAME: "AccMarket",
};

const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });

// ============================================================
// FIREBASE
// ============================================================
const fb = (p) => `${CONFIG.FIREBASE_URL}/${p}.json?auth=${CONFIG.FIREBASE_SECRET}`;
const fbGet = async (p) => { try { return (await axios.get(fb(p))).data; } catch { return null; } };
const fbSet = async (p, d) => { try { return (await axios.put(fb(p), d)).data; } catch { return null; } };
const fbPatch = async (p, d) => { try { return (await axios.patch(fb(p), d)).data; } catch { return null; } };
const fbPush = async (p, d) => { try { return (await axios.post(fb(p), d)).data; } catch { return null; } };
const fbDel = async (p) => { try { return (await axios.delete(fb(p))).data; } catch { return null; } };

// ============================================================
// STATE
// ============================================================
const state = {};
const setState = (id, s) => state[id] = s;
const getState = (id) => state[id] || null;
const clearState = (id) => delete state[id];

// ============================================================
// HELPERS
// ============================================================
const fmt = (n) => "₹" + (n || 0).toFixed(0);
const genId = () => "ACC" + Date.now().toString().slice(-8);

const PLATFORM_EMOJI = {
  telegram: "✈️",
  instagram: "📸",
  facebook: "👤",
  twitter: "🐦",
  youtube: "▶️",
};

const PLATFORM_NAME = {
  telegram: "Telegram",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter/X",
  youtube: "YouTube",
};

async function getOrCreateUser(msg) {
  const id = msg.chat.id.toString();
  let user = await fbGet(`am_users/${id}`);
  if (!user) {
    user = { telegramId: id, name: msg.from.first_name || "User", username: msg.from.username || "", joinedAt: Date.now(), totalPurchases: 0, totalSpent: 0 };
    await fbSet(`am_users/${id}`, user);
  }
  return user;
}

// ============================================================
// MAIN KEYBOARD
// ============================================================
const MAIN_KB = {
  keyboard: [
    ["📸 Instagram Accounts", "✈️ Telegram Accounts"],
    ["👤 Facebook Accounts", "🐦 Twitter Accounts"],
    ["▶️ YouTube Accounts", "🛒 Mere Purchases"],
    ["📞 Support"],
  ],
  resize_keyboard: true,
};

const ADMIN_KB = {
  keyboard: [
    ["➕ Account Add", "📋 Accounts List"],
    ["💰 Orders", "📊 Stats"],
    ["👥 Users", "📢 Broadcast"],
    ["🔙 User Mode"],
  ],
  resize_keyboard: true,
};

async function sendMenu(chatId, user) {
  const isAdmin = chatId.toString() === CONFIG.ADMIN_ID;
  await bot.sendMessage(chatId,
    `🏪 *AccMarket — Account Marketplace*\n\n` +
    `Namaste, *${user.name}*! 👋\n\n` +
    `Premium social media accounts kharidein!\n\n` +
    `✅ 100% Safe & Verified\n` +
    `⚡ Instant Delivery after payment\n` +
    `🔒 Full ownership transfer\n\n` +
    (isAdmin ? `👑 *Admin Mode Active*` : `Platform choose karein:`),
    { parse_mode: "Markdown", reply_markup: isAdmin ? ADMIN_KB : MAIN_KB }
  );
}

// ============================================================
// /start
// ============================================================
bot.onText(/\/start/, async (msg) => {
  clearState(msg.chat.id);
  const user = await getOrCreateUser(msg);
  await sendMenu(msg.chat.id, user);
});

// ============================================================
// MESSAGE HANDLER
// ============================================================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  if (text.startsWith("/start")) return;

  const s = getState(chatId);
  const isAdmin = chatId.toString() === CONFIG.ADMIN_ID;

  // Admin state machine
  if (s?.step === "add_platform")     return adminAddPlatform(msg, s);
  if (s?.step === "add_username")     return adminAddUsername(msg, s);
  if (s?.step === "add_followers")    return adminAddFollowers(msg, s);
  if (s?.step === "add_price")        return adminAddPrice(msg, s);
  if (s?.step === "add_desc")         return adminAddDesc(msg, s);
  if (s?.step === "add_credentials")  return adminAddCredentials(msg, s);
  if (s?.step === "broadcast_msg")    return adminBroadcast(msg, s);

  // Buy state machine
  if (s?.step === "await_utr")        return handleBuyUTR(msg, s);

  // Admin buttons
  if (isAdmin) {
    if (text === "➕ Account Add")  return startAddAccount(chatId);
    if (text === "📋 Accounts List") return adminListAccounts(chatId);
    if (text === "💰 Orders")        return adminOrders(chatId);
    if (text === "📊 Stats")         return adminStats(chatId);
    if (text === "👥 Users")         return adminUsers(chatId);
    if (text === "📢 Broadcast")     return startBroadcast(chatId);
    if (text === "🔙 User Mode")     return bot.sendMessage(chatId, "User mode:", { reply_markup: MAIN_KB });
  }

  // User buttons
  if (text === "📸 Instagram Accounts") return showAccounts(chatId, "instagram");
  if (text === "✈️ Telegram Accounts")  return showAccounts(chatId, "telegram");
  if (text === "👤 Facebook Accounts")  return showAccounts(chatId, "facebook");
  if (text === "🐦 Twitter Accounts")   return showAccounts(chatId, "twitter");
  if (text === "▶️ YouTube Accounts")   return showAccounts(chatId, "youtube");
  if (text === "🛒 Mere Purchases")     return showPurchases(chatId);
  if (text === "📞 Support")            return showSupport(chatId);

  const user = await getOrCreateUser(msg);
  sendMenu(chatId, user);
});

// ============================================================
// SHOW ACCOUNTS (User)
// ============================================================
async function showAccounts(chatId, platform) {
  const accounts = await fbGet("am_accounts");
  if (!accounts) {
    return bot.sendMessage(chatId,
      `${PLATFORM_EMOJI[platform]} *${PLATFORM_NAME[platform]} Accounts*\n\n😔 Abhi koi account available nahi hai.\nJald hi naye accounts aayenge! Stay tuned 🔔`,
      { parse_mode: "Markdown", reply_markup: MAIN_KB }
    );
  }

  const filtered = Object.entries(accounts)
    .filter(([, a]) => a.platform === platform && a.status === "available");

  if (!filtered.length) {
    return bot.sendMessage(chatId,
      `${PLATFORM_EMOJI[platform]} *${PLATFORM_NAME[platform]} Accounts*\n\n😔 Abhi koi account available nahi.\nJald aayenge! 🔔`,
      { parse_mode: "Markdown", reply_markup: MAIN_KB }
    );
  }

  await bot.sendMessage(chatId,
    `${PLATFORM_EMOJI[platform]} *${PLATFORM_NAME[platform]} Accounts — ${filtered.length} Available*\n\nKisi bhi account pe click karo details ke liye:`,
    { parse_mode: "Markdown" }
  );

  for (const [id, acc] of filtered) {
    const kb = {
      inline_keyboard: [[{ text: `🛒 Buy Now — ${fmt(acc.price)}`, callback_data: `buy_${id}` }]],
    };

    await bot.sendMessage(chatId,
      `${PLATFORM_EMOJI[platform]} *${acc.username}*\n\n` +
      `👥 Followers/Members: *${Number(acc.followers).toLocaleString()}*\n` +
      `💰 Price: *${fmt(acc.price)}*\n` +
      `📝 Details: ${acc.description}\n` +
      `📅 Listed: ${new Date(acc.listedAt).toLocaleDateString("en-IN")}\n\n` +
      `🆔 ID: \`${id}\``,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  }
}

// ============================================================
// BUY FLOW
// ============================================================
bot.on("callback_query", async (query) => {
  const d = query.data;
  const chatId = query.message.chat.id;

  // Buy account
  if (d.startsWith("buy_")) {
    const accId = d.replace("buy_", "");
    const acc = await fbGet(`am_accounts/${accId}`);
    if (!acc) return bot.answerCallbackQuery(query.id, { text: "Account nahi mila!" });
    if (acc.status !== "available") return bot.answerCallbackQuery(query.id, { text: "Yeh account already sold ho gaya!" });

    bot.answerCallbackQuery(query.id);
    setState(chatId, { step: "await_utr", data: { accId, acc } });

    await bot.sendMessage(chatId,
      `🛒 *Account Purchase*\n\n` +
      `${PLATFORM_EMOJI[acc.platform]} *${acc.username}*\n` +
      `👥 Followers: *${Number(acc.followers).toLocaleString()}*\n` +
      `💰 Price: *${fmt(acc.price)}*\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `💳 *Payment Kaise Karein:*\n\n` +
      `1️⃣ UPI ID pe pay karein:\n\`${CONFIG.UPI_ID}\`\n\n` +
      `2️⃣ Exactly *${fmt(acc.price)}* bhejein\n\n` +
      `3️⃣ Payment ke baad UTR number yahan bhejein\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `UTR number payment confirmation mein milta hai (12 digit)`,
      {
        parse_mode: "Markdown",
        reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true },
      }
    );
    return;
  }

  // Admin approve/reject
  if (d.startsWith("apv_")) {
    const parts = d.split("_");
    const orderId = parts[1], userId = parts[2], accId = parts[3];

    const acc = await fbGet(`am_accounts/${accId}`);
    const user = await fbGet(`am_users/${userId}`);
    if (!acc || !user) return bot.answerCallbackQuery(query.id, { text: "Error!" });

    // Mark account sold
    await fbPatch(`am_accounts/${accId}`, { status: "sold", soldTo: userId, soldAt: Date.now() });
    // Mark order approved
    await fbPatch(`am_orders/${orderId}`, { status: "approved", approvedAt: Date.now() });
    // Update user stats
    await fbPatch(`am_users/${userId}`, {
      totalPurchases: (user.totalPurchases || 0) + 1,
      totalSpent: (user.totalSpent || 0) + acc.price,
    });

    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: `✅ Approved — ${acc.username}`, callback_data: "x" }]] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    );
    bot.answerCallbackQuery(query.id, { text: "✅ Approved!" });

    // Send credentials to buyer
    bot.sendMessage(userId,
      `🎉 *Payment Approved! Account Yours Hai!*\n\n` +
      `${PLATFORM_EMOJI[acc.platform]} *${acc.username}*\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🔐 *Account Credentials:*\n\n` +
      `${acc.credentials}\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `⚠️ *Important:*\n` +
      `• Turant password change karo\n` +
      `• Recovery email/phone apna dalo\n` +
      `• Credentials kisi ko mat batao\n\n` +
      `Enjoy your new account! 🚀`,
      { parse_mode: "Markdown", reply_markup: MAIN_KB }
    ).catch(() => {});

    return;
  }

  if (d.startsWith("rej_")) {
    const parts = d.split("_");
    const orderId = parts[1], userId = parts[2];
    await fbPatch(`am_orders/${orderId}`, { status: "rejected", rejectedAt: Date.now() });

    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: "❌ Rejected", callback_data: "x" }]] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    );
    bot.answerCallbackQuery(query.id, { text: "❌ Rejected." });

    bot.sendMessage(userId,
      `❌ *Payment Rejected*\n\nAapki payment verify nahi ho payi.\nUTR galat tha ya payment nahi aayi.\n\nDobara try karein ya support se contact karein.`,
      { parse_mode: "Markdown", reply_markup: MAIN_KB }
    ).catch(() => {});
    return;
  }

  // Admin delete account
  if (d.startsWith("del_")) {
    const accId = d.replace("del_", "");
    await fbDel(`am_accounts/${accId}`);
    bot.answerCallbackQuery(query.id, { text: "✅ Account deleted!" });
    bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "🗑️ Deleted", callback_data: "x" }]] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    );
    return;
  }
});

async function handleBuyUTR(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await getOrCreateUser(msg)); }

  const utr = msg.text.trim();
  if (utr.length < 10 || isNaN(utr)) return bot.sendMessage(chatId, "❌ Valid UTR dalein! (10-12 digit number)");

  const { accId, acc } = s.data;

  // Double check account still available
  const freshAcc = await fbGet(`am_accounts/${accId}`);
  if (!freshAcc || freshAcc.status !== "available") {
    clearState(chatId);
    return bot.sendMessage(chatId, "😔 Yeh account abhi sold ho gaya! Doosra choose karein.", { reply_markup: MAIN_KB });
  }

  const user = await getOrCreateUser(msg);
  const orderId = genId();

  await fbPush(`am_orders`, {
    orderId, accId, platform: acc.platform, username: acc.username,
    price: acc.price, buyerId: chatId.toString(), buyerName: user.name,
    utrNumber: utr, status: "pending", createdAt: Date.now(),
  });

  // Reserve account
  await fbPatch(`am_accounts/${accId}`, { status: "reserved", reservedBy: chatId.toString(), reservedAt: Date.now() });

  clearState(chatId);

  bot.sendMessage(chatId,
    `✅ *Order Submit Ho Gaya!*\n\n` +
    `Order ID: \`${orderId}\`\n` +
    `Account: *${acc.username}*\n` +
    `Amount: *${fmt(acc.price)}*\n` +
    `UTR: \`${utr}\`\n\n` +
    `Admin 15-30 min mein verify karega.\nVerify hone ke baad account credentials aapko bhej diye jayenge! 🎉`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );

  // Notify admin
  bot.sendMessage(CONFIG.ADMIN_ID,
    `🛒 *New Purchase Order!*\n\n` +
    `Order ID: \`${orderId}\`\n` +
    `Account: *${PLATFORM_EMOJI[acc.platform]} ${acc.username}*\n` +
    `Price: *${fmt(acc.price)}*\n` +
    `Buyer: ${user.name} (${chatId})\n` +
    `UTR: \`${utr}\``,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve & Send Credentials", callback_data: `apv_${orderId}_${chatId}_${accId}` },
          { text: "❌ Reject", callback_data: `rej_${orderId}_${chatId}` },
        ]],
      },
    }
  );
}

// ============================================================
// PURCHASES HISTORY
// ============================================================
async function showPurchases(chatId) {
  const orders = await fbGet("am_orders");
  if (!orders) return bot.sendMessage(chatId, "📭 Koi purchase nahi hai.", { reply_markup: MAIN_KB });

  const mine = Object.entries(orders)
    .filter(([, o]) => o.buyerId === chatId.toString())
    .sort(([, a], [, b]) => b.createdAt - a.createdAt)
    .slice(0, 10);

  if (!mine.length) return bot.sendMessage(chatId, "📭 Koi purchase nahi hai abhi tak.", { reply_markup: MAIN_KB });

  let text = "🛒 *Mere Purchases:*\n\n";
  const statusEmoji = { pending: "🕐", approved: "✅", rejected: "❌" };
  mine.forEach(([, o]) => {
    text += `${statusEmoji[o.status] || "🔹"} *${PLATFORM_EMOJI[o.platform]} ${o.username}*\n`;
    text += `   ${fmt(o.price)} | ${o.status} | ${new Date(o.createdAt).toLocaleDateString("en-IN")}\n\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: MAIN_KB });
}

// ============================================================
// ADMIN — ADD ACCOUNT FLOW
// ============================================================
async function startAddAccount(chatId) {
  setState(chatId, { step: "add_platform", data: {} });
  bot.sendMessage(chatId,
    `➕ *New Account Add Karein*\n\nPlatform choose karein:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [["📸 Instagram", "✈️ Telegram"], ["👤 Facebook", "🐦 Twitter"], ["▶️ YouTube"], ["❌ Cancel"]],
        resize_keyboard: true, one_time_keyboard: true,
      },
    }
  );
}

async function adminAddPlatform(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return bot.sendMessage(chatId, "Cancelled.", { reply_markup: ADMIN_KB }); }

  const map = { "📸 Instagram": "instagram", "✈️ Telegram": "telegram", "👤 Facebook": "facebook", "🐦 Twitter": "twitter", "▶️ YouTube": "youtube" };
  const platform = map[msg.text];
  if (!platform) return bot.sendMessage(chatId, "Platform select karein!");

  setState(chatId, { step: "add_username", data: { platform } });
  bot.sendMessage(chatId, `✅ ${PLATFORM_NAME[platform]} selected!\n\n*Account username* dalein:\n(e.g. @username ya profile name)`,
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function adminAddUsername(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return bot.sendMessage(chatId, "Cancelled.", { reply_markup: ADMIN_KB }); }
  setState(chatId, { step: "add_followers", data: { ...s.data, username: msg.text } });
  bot.sendMessage(chatId, `*Followers / Members / Subscribers count* dalein:\n(sirf number, e.g. 5000)`,
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function adminAddFollowers(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return bot.sendMessage(chatId, "Cancelled.", { reply_markup: ADMIN_KB }); }
  const followers = parseInt(msg.text.replace(/,/g, ""));
  if (isNaN(followers)) return bot.sendMessage(chatId, "Valid number dalein!");
  setState(chatId, { step: "add_price", data: { ...s.data, followers } });
  bot.sendMessage(chatId, `*Price* dalein (₹ mein):\n(e.g. 500)`,
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function adminAddPrice(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return bot.sendMessage(chatId, "Cancelled.", { reply_markup: ADMIN_KB }); }
  const price = parseFloat(msg.text.replace("₹", ""));
  if (isNaN(price) || price <= 0) return bot.sendMessage(chatId, "Valid price dalein!");
  setState(chatId, { step: "add_desc", data: { ...s.data, price } });
  bot.sendMessage(chatId, `*Description* dalein:\n(account ke baare mein — age, niche, engagement, etc.)`,
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function adminAddDesc(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return bot.sendMessage(chatId, "Cancelled.", { reply_markup: ADMIN_KB }); }
  setState(chatId, { step: "add_credentials", data: { ...s.data, description: msg.text } });
  bot.sendMessage(chatId,
    `*Account Credentials* dalein:\n\nFormat:\nEmail: abc@gmail.com\nPassword: xxx123\nRecovery: 9876543210\n\n(yeh buyer ko automatically bheja jayega payment approve ke baad)`,
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function adminAddCredentials(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return bot.sendMessage(chatId, "Cancelled.", { reply_markup: ADMIN_KB }); }

  const { platform, username, followers, price, description } = s.data;
  const accId = genId();

  await fbSet(`am_accounts/${accId}`, {
    platform, username, followers, price, description,
    credentials: msg.text, status: "available", listedAt: Date.now(),
  });

  clearState(chatId);

  bot.sendMessage(chatId,
    `✅ *Account Listed!*\n\n` +
    `${PLATFORM_EMOJI[platform]} *${username}*\n` +
    `👥 Followers: *${followers.toLocaleString()}*\n` +
    `💰 Price: *${fmt(price)}*\n` +
    `🆔 ID: \`${accId}\`\n\n` +
    `Ab users isko dekh sakte hain!`,
    { parse_mode: "Markdown", reply_markup: ADMIN_KB }
  );
}

// ============================================================
// ADMIN — LIST ACCOUNTS
// ============================================================
async function adminListAccounts(chatId) {
  const accounts = await fbGet("am_accounts");
  if (!accounts) return bot.sendMessage(chatId, "Koi account listed nahi.", { reply_markup: ADMIN_KB });

  const list = Object.entries(accounts).sort(([,a],[,b]) => b.listedAt - a.listedAt);

  await bot.sendMessage(chatId, `📋 *All Accounts (${list.length}):*`, { parse_mode: "Markdown" });

  for (const [id, acc] of list.slice(0, 15)) {
    const statusEmoji = { available: "🟢", sold: "🔴", reserved: "🟡" }[acc.status] || "⚪";
    await bot.sendMessage(chatId,
      `${statusEmoji} ${PLATFORM_EMOJI[acc.platform]} *${acc.username}*\n` +
      `👥 ${Number(acc.followers).toLocaleString()} | 💰 ${fmt(acc.price)} | *${acc.status}*\n` +
      `🆔 \`${id}\``,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🗑️ Delete", callback_data: `del_${id}` }]],
        },
      }
    );
  }
}

// ============================================================
// ADMIN — ORDERS
// ============================================================
async function adminOrders(chatId) {
  const orders = await fbGet("am_orders");
  if (!orders) return bot.sendMessage(chatId, "Koi order nahi.", { reply_markup: ADMIN_KB });

  const list = Object.entries(orders).sort(([,a],[,b]) => b.createdAt - a.createdAt).slice(0, 10);
  let text = "💰 *Recent Orders:*\n\n";
  const sEmoji = { pending: "🕐", approved: "✅", rejected: "❌" };
  list.forEach(([, o]) => {
    text += `${sEmoji[o.status]||"🔹"} *${PLATFORM_EMOJI[o.platform]} ${o.username}*\n`;
    text += `   ${fmt(o.price)} | ${o.buyerName} | UTR: \`${o.utrNumber}\`\n\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: ADMIN_KB });
}

// ============================================================
// ADMIN — STATS
// ============================================================
async function adminStats(chatId) {
  const [accounts, orders, users] = await Promise.all([fbGet("am_accounts"), fbGet("am_orders"), fbGet("am_users")]);

  const allAccs = accounts ? Object.values(accounts) : [];
  const allOrders = orders ? Object.values(orders) : [];

  const available = allAccs.filter(a => a.status === "available").length;
  const sold = allAccs.filter(a => a.status === "sold").length;
  const revenue = allOrders.filter(o => o.status === "approved").reduce((s, o) => s + (o.price||0), 0);
  const pending = allOrders.filter(o => o.status === "pending").length;

  bot.sendMessage(chatId,
    `📊 *AccMarket Stats*\n\n` +
    `👥 Total Users: *${users ? Object.keys(users).length : 0}*\n` +
    `🟢 Available Accounts: *${available}*\n` +
    `🔴 Sold Accounts: *${sold}*\n` +
    `🛒 Total Orders: *${allOrders.length}*\n` +
    `⏳ Pending Orders: *${pending}*\n` +
    `💰 Total Revenue: *${fmt(revenue)}*`,
    { parse_mode: "Markdown", reply_markup: ADMIN_KB }
  );
}

// ============================================================
// ADMIN — USERS
// ============================================================
async function adminUsers(chatId) {
  const users = await fbGet("am_users");
  if (!users) return bot.sendMessage(chatId, "Koi user nahi.", { reply_markup: ADMIN_KB });
  const list = Object.values(users).sort((a,b) => (b.totalSpent||0)-(a.totalSpent||0)).slice(0,15);
  let text = `👥 *Users (${Object.keys(users).length}):*\n\n`;
  list.forEach((u,i) => {
    text += `*${i+1}.* ${u.name} | Purchases: ${u.totalPurchases||0} | Spent: ${fmt(u.totalSpent)}\n`;
  });
  bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: ADMIN_KB });
}

// ============================================================
// ADMIN — BROADCAST
// ============================================================
async function startBroadcast(chatId) {
  setState(chatId, { step: "broadcast_msg", data: {} });
  bot.sendMessage(chatId, "📢 *Broadcast Message* dalein:\n\nSab users ko yeh message jayega.",
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function adminBroadcast(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return bot.sendMessage(chatId, "Cancelled.", { reply_markup: ADMIN_KB }); }

  const users = await fbGet("am_users");
  if (!users) { clearState(chatId); return bot.sendMessage(chatId, "Koi user nahi.", { reply_markup: ADMIN_KB }); }

  clearState(chatId);
  let sent = 0;
  for (const uid of Object.keys(users)) {
    try { await bot.sendMessage(uid, `📢 *AccMarket*\n\n${msg.text}`, { parse_mode: "Markdown" }); sent++; } catch {}
  }
  bot.sendMessage(chatId, `✅ Sent to ${sent} users!`, { reply_markup: ADMIN_KB });
}

// ============================================================
// SUPPORT
// ============================================================
function showSupport(chatId) {
  bot.sendMessage(chatId,
    `📞 *Support*\n\nKisi bhi problem ke liye:\n\nAdmin se directly contact karein!\n⏰ Response: 15-30 min\n\n_Purchased account issue? Order ID ke saath message karein._`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );
}

console.log("✅ AccMarket Bot Running! 🔥");
