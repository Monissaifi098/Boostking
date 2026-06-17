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
  PANEL_URL: "https://boostking.netlify.app",
  DAILY_REWARD: 0.50,        // ₹0.50 daily reward
  REFERRAL_BONUS: 5.00,      // ₹5 per referral
  REFERRAL_ORDER_BONUS: 2.0, // % of referred user's order cost
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

// ============================================================
// STATE
// ============================================================
const state = {};
const setState = (id, s) => state[id] = s;
const getState = (id) => state[id] || null;
const clearState = (id) => delete state[id];

// ============================================================
// DEFAULT SERVICES
// ============================================================
const DEFAULT_SERVICES = {
  ig_followers: { name: "Instagram Followers", category: "📸 Instagram", price: 12, min: 100, max: 50000 },
  ig_likes:     { name: "Instagram Post Likes", category: "📸 Instagram", price: 8, min: 50, max: 20000 },
  ig_views:     { name: "Instagram Reel Views", category: "📸 Instagram", price: 3, min: 500, max: 500000 },
  ig_comments:  { name: "Instagram Comments", category: "📸 Instagram", price: 80, min: 10, max: 500 },
  yt_views:     { name: "YouTube Video Views", category: "▶️ YouTube", price: 15, min: 500, max: 1000000 },
  yt_subs:      { name: "YouTube Subscribers", category: "▶️ YouTube", price: 35, min: 100, max: 10000 },
  yt_likes:     { name: "YouTube Video Likes", category: "▶️ YouTube", price: 20, min: 50, max: 10000 },
  yt_hours:     { name: "YouTube Watch Hours", category: "▶️ YouTube", price: 250, min: 100, max: 4000 },
  tg_members:   { name: "Telegram Channel Members", category: "✈️ Telegram", price: 18, min: 100, max: 100000 },
  tg_views:     { name: "Telegram Post Views", category: "✈️ Telegram", price: 5, min: 500, max: 500000 },
  tg_reactions: { name: "Telegram Reactions", category: "✈️ Telegram", price: 25, min: 100, max: 10000 },
  fb_followers: { name: "Facebook Page Followers", category: "👤 Facebook", price: 20, min: 100, max: 50000 },
  fb_likes:     { name: "Facebook Post Likes", category: "👤 Facebook", price: 15, min: 50, max: 10000 },
};

async function getServices() {
  const fbSvcs = await fbGet("services");
  return fbSvcs || DEFAULT_SERVICES;
}

// ============================================================
// HELPERS
// ============================================================
const fmt = (n) => "₹" + (n || 0).toFixed(2);
const genId = () => "BK" + Date.now().toString().slice(-8);
const statusEmoji = (s) => ({ pending: "🕐", processing: "⚙️", completed: "✅", cancelled: "❌" }[s] || "🔹");

async function getOrCreateUser(msg, referredBy = null) {
  const id = msg.chat.id.toString();
  let user = await fbGet(`users/${id}`);
  if (!user) {
    user = {
      telegramId: id,
      name: msg.from.first_name || "User",
      username: msg.from.username || "",
      balance: 0,
      totalOrders: 0,
      totalSpent: 0,
      joinedAt: Date.now(),
      status: "active",
      lastReward: 0,
      referredBy: referredBy || null,
      referrals: 0,
      referralEarnings: 0,
    };
    await fbSet(`users/${id}`, user);

    // Give referral bonus to referrer
    if (referredBy && referredBy !== id) {
      const referrer = await fbGet(`users/${referredBy}`);
      if (referrer) {
        const newBal = (referrer.balance || 0) + CONFIG.REFERRAL_BONUS;
        const newRefs = (referrer.referrals || 0) + 1;
        const newEarn = (referrer.referralEarnings || 0) + CONFIG.REFERRAL_BONUS;
        await fbPatch(`users/${referredBy}`, { balance: newBal, referrals: newRefs, referralEarnings: newEarn });
        bot.sendMessage(referredBy,
          `🎉 *Referral Bonus!*\n\n${user.name} ne aapke link se join kiya!\n💰 *+${fmt(CONFIG.REFERRAL_BONUS)}* add ho gaya!\nNew Balance: *${fmt(newBal)}*`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
      }
    }
  }
  return user;
}

// ============================================================
// MAIN KEYBOARD
// ============================================================
const MAIN_KB = {
  keyboard: [
    ["🛒 Order Karein", "💰 Wallet"],
    ["📦 Mere Orders", "➕ Balance Add"],
    ["🎁 Daily Reward", "👥 Refer & Earn"],
    ["🌐 Mini App", "📞 Support"],
  ],
  resize_keyboard: true,
};

async function sendMenu(chatId, user) {
  const today = new Date().toDateString();
  const lastRewardDate = user.lastReward ? new Date(user.lastReward).toDateString() : null;
  const canClaim = lastRewardDate !== today;

  await bot.sendMessage(chatId,
    `👑 *BoostKing SMM Panel*\n\n` +
    `Namaste, *${user.name}*! 🙏\n\n` +
    `💰 Balance: *${fmt(user.balance)}*\n` +
    `📦 Total Orders: *${user.totalOrders || 0}*\n` +
    `👥 Referrals: *${user.referrals || 0}*\n` +
    (canClaim ? `\n🎁 *Daily reward claim karo!*` : `\n✅ Aaj ka reward claim ho gaya!`),
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );
}

// ============================================================
// /start — with referral support
// ============================================================
bot.onText(/\/start(.*)/, async (msg, match) => {
  clearState(msg.chat.id);
  const param = match[1].trim();
  const referredBy = param.startsWith("ref_") ? param.replace("ref_", "") : null;
  const user = await getOrCreateUser(msg, referredBy);
  await sendMenu(msg.chat.id, user);
});

// ============================================================
// MAIN MESSAGE HANDLER
// ============================================================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  if (text.startsWith("/start")) return;

  const s = getState(chatId);

  // State machine
  if (s?.step === "await_category")    return handleCategory(msg, s);
  if (s?.step === "await_service")     return handleService(msg, s);
  if (s?.step === "await_link")        return handleLink(msg, s);
  if (s?.step === "await_qty")         return handleQty(msg, s);
  if (s?.step === "confirm_order")     return handleConfirm(msg, s);
  if (s?.step === "await_pay_amount")  return handlePayAmount(msg, s);
  if (s?.step === "await_utr")         return handleUTR(msg, s);
  if (s?.step === "admin_user_select") return handleAdminUserSelect(msg, s);
  if (s?.step === "admin_amount")      return handleAdminAmount(msg, s);

  // Menu
  if (text === "🛒 Order Karein")   return startOrder(chatId);
  if (text === "💰 Wallet")         return showWallet(chatId);
  if (text === "📦 Mere Orders")    return showOrders(chatId);
  if (text === "➕ Balance Add")    return startAddBalance(chatId);
  if (text === "🎁 Daily Reward")   return claimDailyReward(chatId, msg);
  if (text === "👥 Refer & Earn")   return showReferral(chatId);
  if (text === "🌐 Mini App")       return showMiniApp(chatId);
  if (text === "📞 Support")        return showSupport(chatId);

  const user = await getOrCreateUser(msg);
  sendMenu(chatId, user);
});

// ============================================================
// WALLET
// ============================================================
async function showWallet(chatId) {
  const user = await fbGet(`users/${chatId}`);
  if (!user) return bot.sendMessage(chatId, "Pehle /start karein!");
  bot.sendMessage(chatId,
    `💰 *Aapka Wallet*\n\n` +
    `Balance: *${fmt(user.balance)}*\n` +
    `Total Orders: *${user.totalOrders || 0}*\n` +
    `Total Spent: *${fmt(user.totalSpent)}*\n` +
    `Referral Earnings: *${fmt(user.referralEarnings)}*\n` +
    `Referrals: *${user.referrals || 0}*`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );
}

// ============================================================
// DAILY REWARD
// ============================================================
async function claimDailyReward(chatId, msg) {
  const user = await fbGet(`users/${chatId}`);
  if (!user) return;

  const today = new Date().toDateString();
  const lastDate = user.lastReward ? new Date(user.lastReward).toDateString() : null;

  if (lastDate === today) {
    return bot.sendMessage(chatId,
      `⏰ *Daily Reward Already Claimed!*\n\nAap aaj ka reward pehle le chuke hain.\nKal wapas aana! 🙏\n\n💰 Balance: *${fmt(user.balance)}*`,
      { parse_mode: "Markdown", reply_markup: MAIN_KB }
    );
  }

  const reward = CONFIG.DAILY_REWARD;
  const newBal = (user.balance || 0) + reward;
  await fbPatch(`users/${chatId}`, { balance: newBal, lastReward: Date.now() });

  bot.sendMessage(chatId,
    `🎉 *Daily Reward Claim Ho Gaya!*\n\n` +
    `💰 *+${fmt(reward)}* aapke wallet mein add ho gaya!\n` +
    `New Balance: *${fmt(newBal)}*\n\n` +
    `Kal phir aana aur reward lo! 🚀`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );
}

// ============================================================
// REFER & EARN
// ============================================================
async function showReferral(chatId) {
  const user = await fbGet(`users/${chatId}`);
  if (!user) return;

  const refLink = `https://t.me/${(await bot.getMe()).username}?start=ref_${chatId}`;

  bot.sendMessage(chatId,
    `👥 *Refer & Earn*\n\n` +
    `Har referral pe: *${fmt(CONFIG.REFERRAL_BONUS)}*\n\n` +
    `Aapka Referral Link:\n\`${refLink}\`\n\n` +
    `📊 *Aapke Stats:*\n` +
    `Total Referrals: *${user.referrals || 0}*\n` +
    `Referral Earnings: *${fmt(user.referralEarnings)}*\n\n` +
    `*Kaise kaam karta hai?*\n` +
    `1️⃣ Apna link share karo\n` +
    `2️⃣ Koi join kare toh *${fmt(CONFIG.REFERRAL_BONUS)}* milega\n` +
    `3️⃣ Jitne log, utna paisa! 💰`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🔗 Link Share Karo", switch_inline_query: `BoostKing se paise kamao! Join karo: ${refLink}` }]],
      },
    }
  );
}

// ============================================================
// MINI APP
// ============================================================
async function showMiniApp(chatId) {
  bot.sendMessage(chatId,
    `🌐 *BoostKing Mini App*\n\nPura panel apne phone mein!\n\n✅ Services order karo\n✅ Balance check karo\n✅ Orders track karo`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🚀 Mini App Kholein", web_app: { url: CONFIG.PANEL_URL } }]],
      },
    }
  );
}

// ============================================================
// ORDERS
// ============================================================
async function showOrders(chatId) {
  const all = await fbGet("orders");
  if (!all) return bot.sendMessage(chatId, "📭 Koi order nahi hai.", { reply_markup: MAIN_KB });

  const mine = Object.entries(all)
    .filter(([, o]) => o.telegramId === chatId.toString())
    .sort(([, a], [, b]) => b.createdAt - a.createdAt)
    .slice(0, 8);

  if (!mine.length) return bot.sendMessage(chatId, "📭 Koi order nahi hai abhi tak.", { reply_markup: MAIN_KB });

  let text = "📦 *Aapke Recent Orders:*\n\n";
  mine.forEach(([, o]) => {
    text += `${statusEmoji(o.status)} *${o.serviceName}*\n   Qty: ${(o.quantity||0).toLocaleString()} | ${fmt(o.cost)} | \`${o.status}\`\n\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: MAIN_KB });
}

// ============================================================
// ORDER FLOW
// ============================================================
async function startOrder(chatId) {
  const services = await getServices();
  const categories = [...new Set(Object.values(services).map(s => s.category))];
  setState(chatId, { step: "await_category", data: { services, categories } });

  bot.sendMessage(chatId, "🛒 *Kaunsa Platform?*\n\nSelect karo:", {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [...categories.map(c => [c]), ["❌ Cancel"]],
      resize_keyboard: true, one_time_keyboard: true,
    },
  });
}

async function handleCategory(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await fbGet(`users/${chatId}`) || {}); }

  const { services, categories } = s.data;
  if (!categories.includes(msg.text)) return bot.sendMessage(chatId, "Platform select karein!");

  const catSvcs = Object.entries(services).filter(([, sv]) => sv.category === msg.text);
  setState(chatId, { step: "await_service", data: { services, catSvcs, category: msg.text } });

  let text = `📋 *${msg.text} Services:*\n\n`;
  catSvcs.forEach(([, sv], i) => {
    text += `*${i+1}.* ${sv.name}\n   💰 ₹${sv.price}/1000 | Min: ${sv.min.toLocaleString()}\n\n`;
  });
  text += "Number select karein:";

  bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [...catSvcs.map(([,sv], i) => [`${i+1}. ${sv.name}`]), ["⬅️ Wapas", "❌ Cancel"]],
      resize_keyboard: true, one_time_keyboard: true,
    },
  });
}

async function handleService(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await fbGet(`users/${chatId}`) || {}); }
  if (msg.text === "⬅️ Wapas") return startOrder(chatId);

  const { catSvcs } = s.data;
  const idx = parseInt(msg.text.split(".")[0]) - 1;
  if (isNaN(idx) || idx < 0 || idx >= catSvcs.length) return bot.sendMessage(chatId, "Sahi number dalein!");

  const [svcId, svc] = catSvcs[idx];
  setState(chatId, { step: "await_link", data: { ...s.data, svcId, svc } });

  bot.sendMessage(chatId,
    `✅ *${svc.name}*\n💰 ₹${svc.price}/1000\nMin: ${svc.min.toLocaleString()} | Max: ${svc.max.toLocaleString()}\n\n🔗 *Link bhejein:*`,
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function handleLink(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await fbGet(`users/${chatId}`) || {}); }
  if (!msg.text.startsWith("http")) return bot.sendMessage(chatId, "Valid link dalein! (https:// se shuru karo)");

  const { svc } = s.data;
  setState(chatId, { step: "await_qty", data: { ...s.data, link: msg.text } });

  const presets = [100,500,1000,5000,10000].filter(p => p >= svc.min && p <= svc.max).slice(0,4);

  bot.sendMessage(chatId,
    `🔗 Link save!\n\n*Quantity* dalein:\nMin: ${svc.min.toLocaleString()} | Max: ${svc.max.toLocaleString()}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [presets.map(String), ["❌ Cancel"]],
        resize_keyboard: true,
      },
    }
  );
}

async function handleQty(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await fbGet(`users/${chatId}`) || {}); }

  const qty = parseInt(msg.text.replace(/,/g, ""));
  const { svc } = s.data;
  if (isNaN(qty)) return bot.sendMessage(chatId, "Valid number dalein!");
  if (qty < svc.min) return bot.sendMessage(chatId, `❌ Minimum ${svc.min.toLocaleString()}!`);
  if (qty > svc.max) return bot.sendMessage(chatId, `❌ Maximum ${svc.max.toLocaleString()}!`);

  const cost = (svc.price / 1000) * qty;
  const user = await fbGet(`users/${chatId}`);
  const hasBal = (user?.balance || 0) >= cost;

  setState(chatId, { step: "confirm_order", data: { ...s.data, qty, cost } });

  bot.sendMessage(chatId,
    `📋 *Order Summary*\n\n` +
    `🛒 Service: *${svc.name}*\n` +
    `🔢 Qty: *${qty.toLocaleString()}*\n` +
    `🔗 Link: \`${s.data.link}\`\n` +
    `💰 Cost: *${fmt(cost)}*\n` +
    `👛 Balance: *${fmt(user?.balance)}*\n\n` +
    (hasBal ? `✅ Confirm karein?` : `❌ Balance kam hai! Pehle add karo.`),
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: hasBal ? [["✅ Confirm", "❌ Cancel"]] : [["➕ Balance Add", "❌ Cancel"]],
        resize_keyboard: true, one_time_keyboard: true,
      },
    }
  );
}

async function handleConfirm(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await fbGet(`users/${chatId}`) || {}); }
  if (msg.text === "➕ Balance Add") { clearState(chatId); return startAddBalance(chatId); }
  if (msg.text !== "✅ Confirm") return;

  const { svcId, svc, link, qty, cost } = s.data;
  const user = await fbGet(`users/${chatId}`);
  if (!user || (user.balance || 0) < cost) return bot.sendMessage(chatId, "❌ Balance kam hai!");

  const orderId = genId();
  await fbPush("orders", {
    telegramId: chatId.toString(), orderId, serviceId: svcId,
    serviceName: svc.name, link, quantity: qty, cost, status: "pending", createdAt: Date.now(),
  });
  await fbPatch(`users/${chatId}`, {
    balance: (user.balance||0) - cost,
    totalOrders: (user.totalOrders||0) + 1,
    totalSpent: (user.totalSpent||0) + cost,
  });

  // Referral order bonus
  if (user.referredBy) {
    const referrer = await fbGet(`users/${user.referredBy}`);
    if (referrer) {
      const bonus = (cost * CONFIG.REFERRAL_ORDER_BONUS) / 100;
      await fbPatch(`users/${user.referredBy}`, {
        balance: (referrer.balance||0) + bonus,
        referralEarnings: (referrer.referralEarnings||0) + bonus,
      });
    }
  }

  clearState(chatId);

  bot.sendMessage(chatId,
    `🎉 *Order Place Ho Gaya!*\n\n` +
    `🆔 ID: \`${orderId}\`\n` +
    `🛒 Service: *${svc.name}*\n` +
    `🔢 Qty: *${qty.toLocaleString()}*\n` +
    `💰 Cost: *${fmt(cost)}*\n` +
    `👛 New Balance: *${fmt((user.balance||0)-cost)}*\n\n` +
    `Status: 🕐 Pending\n\nHum jald process karenge! 🚀`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );

  bot.sendMessage(CONFIG.ADMIN_ID,
    `📦 *New Order!*\n\nID: \`${orderId}\`\nUser: ${user.name} (${chatId})\nService: ${svc.name}\nLink: ${link}\nQty: ${qty.toLocaleString()}\nCost: ${fmt(cost)}`,
    { parse_mode: "Markdown" }
  );
}

// ============================================================
// ADD BALANCE FLOW
// ============================================================
async function startAddBalance(chatId) {
  setState(chatId, { step: "await_pay_amount", data: {} });
  bot.sendMessage(chatId,
    `💳 *Balance Add Karein*\n\n` +
    `UPI ID:\n\`${CONFIG.UPI_ID}\`\n\n` +
    `⚡ PhonePe, GPay, Paytm — sab chalega\n\nKitna add karna hai?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [["₹100", "₹200", "₹500"], ["₹1000", "₹2000", "₹5000"], ["❌ Cancel"]],
        resize_keyboard: true, one_time_keyboard: true,
      },
    }
  );
}

async function handlePayAmount(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await fbGet(`users/${chatId}`) || {}); }

  const amount = parseFloat(msg.text.replace("₹","").replace(/,/g,"").trim());
  if (isNaN(amount) || amount < 50) return bot.sendMessage(chatId, "❌ Minimum ₹50 dalein!");

  setState(chatId, { step: "await_utr", data: { amount } });

  bot.sendMessage(chatId,
    `💰 *₹${amount} Pay Karein*\n\n` +
    `UPI ID:\n\`${CONFIG.UPI_ID}\`\n\n` +
    `1️⃣ Exactly *₹${amount}* bhejein\n` +
    `2️⃣ Payment ke baad *UTR number* yahan bhejein\n\n` +
    `UTR = 12 digit number (payment confirmation mein milta hai)`,
    { parse_mode: "Markdown", reply_markup: { keyboard: [["❌ Cancel"]], resize_keyboard: true } }
  );
}

async function handleUTR(msg, s) {
  const chatId = msg.chat.id;
  if (msg.text === "❌ Cancel") { clearState(chatId); return sendMenu(chatId, await fbGet(`users/${chatId}`) || {}); }

  const utr = msg.text.trim();
  if (utr.length < 10) return bot.sendMessage(chatId, "❌ Valid UTR dalein! (10-12 digit)");

  const { amount } = s.data;
  const user = await fbGet(`users/${chatId}`);
  const res = await fbPush("payments", {
    telegramId: chatId.toString(), userName: user?.name||"User",
    amount, utrNumber: utr, status: "pending", createdAt: Date.now(),
  });
  const payId = res?.name;
  clearState(chatId);

  bot.sendMessage(chatId,
    `✅ *Request Submit Ho Gayi!*\n\nAmount: *₹${amount}*\nUTR: \`${utr}\`\n\nAdmin 15-30 min mein approve karega!\nApprove hote hi balance add ho jayega. 🙏`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );

  bot.sendMessage(CONFIG.ADMIN_ID,
    `💰 *New Payment!*\n\nID: \`${payId}\`\nUser: ${user?.name} (${chatId})\nAmount: *₹${amount}*\nUTR: \`${utr}\``,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `apv_${payId}_${chatId}_${amount}` },
          { text: "❌ Reject", callback_data: `rej_${payId}_${chatId}` },
        ]],
      },
    }
  );
}

// ============================================================
// CALLBACK
// ============================================================
bot.on("callback_query", async (query) => {
  const d = query.data;
  const adminChat = query.message.chat.id;

  if (d.startsWith("apv_")) {
    const parts = d.split("_");
    const payId = parts[1], userId = parts[2], amount = parseFloat(parts[3]);
    const user = await fbGet(`users/${userId}`);
    if (!user) return bot.answerCallbackQuery(query.id, { text: "User not found!" });

    const newBal = (user.balance||0) + amount;
    await fbPatch(`payments/${payId}`, { status: "approved", approvedAt: Date.now() });
    await fbPatch(`users/${userId}`, { balance: newBal });

    bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: `✅ Approved ₹${amount}`, callback_data: "x" }]] }, { chat_id: adminChat, message_id: query.message.message_id });
    bot.answerCallbackQuery(query.id, { text: `✅ ₹${amount} approved!` });
    bot.sendMessage(userId,
      `🎉 *Payment Approved!*\n\n₹${amount} add ho gaya!\n💰 New Balance: *${fmt(newBal)}*\n\nAbhi order karo! 🚀`,
      { parse_mode: "Markdown", reply_markup: MAIN_KB }
    ).catch(()=>{});

  } else if (d.startsWith("rej_")) {
    const parts = d.split("_");
    const payId = parts[1], userId = parts[2];
    await fbPatch(`payments/${payId}`, { status: "rejected", rejectedAt: Date.now() });
    bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "❌ Rejected", callback_data: "x" }]] }, { chat_id: adminChat, message_id: query.message.message_id });
    bot.answerCallbackQuery(query.id, { text: "❌ Rejected." });
    bot.sendMessage(userId,
      `❌ *Payment Rejected*\n\nRequest reject ho gayi. Support se contact karein.`,
      { parse_mode: "Markdown", reply_markup: MAIN_KB }
    ).catch(()=>{});
  }
});

// ============================================================
// ADMIN COMMANDS
// ============================================================
bot.onText(/\/admin/, (msg) => {
  if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
  bot.sendMessage(msg.chat.id,
    `👑 *Admin Panel*\n\n` +
    `*/stats* — Statistics\n` +
    `*/addbal* — Balance add karo\n` +
    `*/pending* — Pending payments\n` +
    `*/broadcast [msg]* — Sab ko message\n` +
    `*/orders* — Recent orders`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
  const [users, orders, payments] = await Promise.all([fbGet("users"), fbGet("orders"), fbGet("payments")]);
  const revenue = orders ? Object.values(orders).reduce((s,o) => s+(o.cost||0), 0) : 0;
  const pending = payments ? Object.values(payments).filter(p => p.status==="pending").length : 0;
  const todayOrders = orders ? Object.values(orders).filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString()).length : 0;

  bot.sendMessage(msg.chat.id,
    `📊 *BoostKing Stats*\n\n` +
    `👥 Total Users: *${users ? Object.keys(users).length : 0}*\n` +
    `📦 Total Orders: *${orders ? Object.keys(orders).length : 0}*\n` +
    `📦 Today's Orders: *${todayOrders}*\n` +
    `💰 Total Revenue: *${fmt(revenue)}*\n` +
    `⏳ Pending Payments: *${pending}*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/addbal/, async (msg) => {
  if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
  const users = await fbGet("users");
  if (!users) return bot.sendMessage(msg.chat.id, "Koi user nahi.");
  const list = Object.entries(users).slice(0, 20);
  let text = "👥 *User Select Karein:*\n\n";
  list.forEach(([id, u], i) => { text += `*${i+1}.* ${u.name} | ${fmt(u.balance)} | \`${id}\`\n`; });
  text += "\nNumber ya User ID dalein:";
  setState(msg.chat.id, { step: "admin_user_select", data: { list } });
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

async function handleAdminUserSelect(msg, s) {
  const chatId = msg.chat.id;
  const { list } = s.data;
  const idx = parseInt(msg.text) - 1;
  let targetId, targetUser;
  if (!isNaN(idx) && idx >= 0 && idx < list.length) {
    [targetId, targetUser] = list[idx];
  } else {
    targetId = msg.text.trim();
    targetUser = await fbGet(`users/${targetId}`);
  }
  if (!targetUser) return bot.sendMessage(chatId, "❌ User nahi mila!");
  setState(chatId, { step: "admin_amount", data: { targetId, targetUser } });
  bot.sendMessage(chatId, `👤 *${targetUser.name}*\nBalance: *${fmt(targetUser.balance)}*\n\nKitna add karna hai? (₹)`, { parse_mode: "Markdown" });
}

async function handleAdminAmount(msg, s) {
  const chatId = msg.chat.id;
  const amount = parseFloat(msg.text.trim());
  const { targetId, targetUser } = s.data;
  if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, "Valid amount dalein!");
  const newBal = (targetUser.balance||0) + amount;
  await fbPatch(`users/${targetId}`, { balance: newBal });
  clearState(chatId);
  bot.sendMessage(chatId, `✅ *Done!*\n\n${targetUser.name} ko *₹${amount}* add ho gaya!\nNew Balance: *${fmt(newBal)}*`, { parse_mode: "Markdown" });
  bot.sendMessage(targetId,
    `🎉 *Balance Add Ho Gaya!*\n\n₹${amount.toFixed(2)} aapke wallet mein!\n💰 New Balance: *${fmt(newBal)}*\n\nAbhi order karo! 🚀`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  ).catch(()=>{});
}

bot.onText(/\/pending/, async (msg) => {
  if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
  const payments = await fbGet("payments");
  if (!payments) return bot.sendMessage(msg.chat.id, "Koi payment nahi.");
  const pending = Object.entries(payments).filter(([,p]) => p.status === "pending");
  if (!pending.length) return bot.sendMessage(msg.chat.id, "✅ Koi pending nahi!");
  for (const [id, p] of pending.slice(0,10)) {
    bot.sendMessage(msg.chat.id,
      `💰 *Payment*\nID: \`${id}\`\nUser: ${p.userName} (${p.telegramId})\nAmount: *₹${p.amount}*\nUTR: \`${p.utrNumber}\``,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `apv_${id}_${p.telegramId}_${p.amount}` }, { text: "❌ Reject", callback_data: `rej_${id}_${p.telegramId}` }]] },
      }
    );
  }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== CONFIG.ADMIN_ID) return;
  const users = await fbGet("users");
  if (!users) return;
  let sent = 0;
  for (const uid of Object.keys(users)) {
    try { await bot.sendMessage(uid, `📢 *BoostKing*\n\n${match[1]}`, { parse_mode: "Markdown" }); sent++; } catch {}
  }
  bot.sendMessage(msg.chat.id, `✅ Sent to ${sent} users!`);
});

// ============================================================
// SUPPORT
// ============================================================
function showSupport(chatId) {
  bot.sendMessage(chatId,
    `📞 *Support*\n\nKisi bhi problem ke liye admin se contact karein!\n⏰ Response time: 15-30 min`,
    { parse_mode: "Markdown", reply_markup: MAIN_KB }
  );
}

console.log("✅ BoostKing Bot Running! 🔥");
