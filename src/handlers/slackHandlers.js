// handlers/slackHandlers.js
const { App } = require('@slack/bolt');
const Database = require('../database/schema');
const BettingService = require('../services/bettingService');

// ---- Safe parsers that accept Array | JSON string | comma string ----
function parseList(val) {
  if (Array.isArray(val)) return val;
  if (val == null) return [];
  if (typeof val !== 'string') return [];
  // Try JSON first: '["a","b"]'
  try {
    const j = JSON.parse(val);
    if (Array.isArray(j)) return j;
  } catch (_) {}
  // Fallback: 'a,b,c'
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

class SlackHandlers {
  constructor() {
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN,
    });

    this.db = new Database(process.env.DATABASE_PATH || './data/betting.db');
    this.bettingService = new BettingService(this.db);
  }

  static async create() {
    const instance = new SlackHandlers();
    await instance.db.init();
    instance.setupHandlers();
    return instance;
  }

  setupHandlers() {
    this.app.command('/bet', this.handleBetCommand.bind(this));
    this.app.event('reaction_added', this.handleReactionAdded.bind(this));
    this.app.event('reaction_removed', this.handleReactionRemoved.bind(this));
    this.app.error(this.handleError.bind(this));
  }

  // ---------- Slash command dispatcher ----------
  async handleBetCommand({ command, ack, respond, client, body, logger }) {
    await ack();

    try {
      const args = (command.text || '').trim().split(/\s+/);
      const sub = (args[0] || '').toLowerCase();

      switch (sub) {
        case 'create':
          await this.handleCreateLine(args, respond, client, body, logger);
          break;
        case 'lock':
          await this.handleLockLine(args, respond, client, body, logger);
          break;
        case 'resolve':
          await this.handleResolveLine(args, respond, client, body, logger);
          break;
        case 'stats':
          await this.handleStats(respond, body, logger);
          break;
        case 'leaderboard':
          await this.handleLeaderboard(respond, client, body, logger);
          break;
        default:
          await respond({ text: this.getHelpText(), response_type: 'ephemeral' });
      }
    } catch (error) {
      console.error('Error handling /bet:', error);
      await respond({ text: `Error: ${error.message}`, response_type: 'ephemeral' });
    }
  }

  // ---------- /bet create ----------
  async handleCreateLine(args, respond, client, body) {
    if (!this.isAdmin(body.user_id)) {
      await respond({ text: 'Only admins can create betting lines.', response_type: 'ephemeral' });
      return;
    }

    // Expected: /bet create "question" options: opt1, opt2, ...
    const text = args.slice(1).join(' ');
    const optionsMatch = text.match(/options:\s*(.+)$/i);
    if (!optionsMatch) {
      await respond({
        text: 'Usage: `/bet create "question" options: option1, option2, option3`',
        response_type: 'ephemeral',
      });
      return;
    }

    const rawQuestion = text.replace(/options:\s*.+$/i, '').trim();
    const question = rawQuestion.replace(/^["']|["']$/g, '');
    const options = optionsMatch[1].split(',').map((s) => s.trim()).filter(Boolean);

    if (options.length < 2) {
      await respond({ text: 'You must provide at least 2 options.', response_type: 'ephemeral' });
      return;
    }

    const emojis = this.bettingService.generateEmojis(options);

    // Create line; message_ts set after posting
    const line = await this.db.createBettingLine(
      question,
      options,           // DB may store as JSON or CSV depending on implementation
      emojis,
      body.user_id,
      null,              // slack_message_ts (after post)
      body.channel_id
    );

    const message = this.formatBettingLineMessage(line);
    const post = await client.chat.postMessage({
      channel: body.channel_id,
      text: message.text,
      blocks: message.blocks,
    });

    await this.db.updateBettingLineStatus(line.id, 'open', {
      slack_message_ts: post.ts,
      slack_channel_id: body.channel_id,
      created_at: new Date().toISOString(),
    });

   

    for (let i = 0; i < options.length; i++) {
      const emoji = emojis[i];
      if (emoji) {
        try {
          // Convert Slack emoji string to reaction name
          const reactionName = emoji.replace(/:/g, ''); // Remove colons from :emoji:
          
          await client.reactions.add({
            channel: body.channel_id,
            timestamp: post.ts,
            name: reactionName
          });
        } catch (error) {
          console.log(`Could not add reaction ${emoji}:`, error.message);
        }
      }
    }

    await respond({
      text: `Betting line created! Line ID: ${line.id}`,
      response_type: 'ephemeral',
    });
  }

  // ---------- /bet lock ----------
  async handleLockLine(args, respond, client, body) {
    if (!this.isAdmin(body.user_id)) {
      await respond({ text: 'Only admins can lock betting lines.', response_type: 'ephemeral' });
      return;
    }

    const lineId = args[1];
    if (!lineId) {
      await respond({ text: 'Usage: `/bet lock <line_id>`', response_type: 'ephemeral' });
      return;
    }

    const line = await this.db.getBettingLine(lineId);
    if (!line) {
      await respond({ text: 'Betting line not found.', response_type: 'ephemeral' });
      return;
    }
    if (line.status !== 'open') {
      await respond({ text: 'This betting line is already locked or resolved.', response_type: 'ephemeral' });
      return;
    }

    await this.db.updateBettingLineStatus(line.id, 'locked', { locked_at: new Date().toISOString() });

    const summary = await this.bettingService.getLineSummary(lineId);
    const msg = this.formatBettingLineMessage(
      { ...line, options: parseList(line.options), emojis: parseList(line.emojis) },
      summary,
      true
    );

    await client.chat.update({
      channel: line.slack_channel_id,
      ts: line.slack_message_ts,
      text: msg.text,
      blocks: msg.blocks,
    });

    await respond({ text: `Betting line ${lineId} has been locked.`, response_type: 'ephemeral' });
  }

  // ---------- /bet resolve ----------
  async handleResolveLine(args, respond, client, body) {
    if (!this.isAdmin(body.user_id)) {
      await respond({ text: 'Only admins can resolve betting lines.', response_type: 'ephemeral' });
      return;
    }

    const lineId = args[1];
    const winnerMatch = args.join(' ').match(/winner:\s*(.+)$/i);
    if (!lineId || !winnerMatch) {
      await respond({ text: 'Usage: `/bet resolve <line_id> winner: <winning_option>`', response_type: 'ephemeral' });
      return;
    }

    const winningOption = winnerMatch[1].trim();
    const line = await this.db.getBettingLine(lineId);
    if (!line) {
      await respond({ text: 'Betting line not found.', response_type: 'ephemeral' });
      return;
    }

    const opts = parseList(line.options);
    if (!opts.includes(winningOption)) {
      await respond({ text: `Invalid winning option. Must be one of: ${opts.join(', ')}`, response_type: 'ephemeral' });
      return;
    }

    const payoutData = await this.bettingService.processPayouts(lineId, winningOption);

    await this.db.updateBettingLineStatus(line.id, 'resolved', {
      winner_option: winningOption,
      resolved_at: new Date().toISOString(),
    });

    const summary = await this.bettingService.getLineSummary(lineId);
    const msg = this.formatBettingLineMessage(
      { ...line, options: opts, emojis: parseList(line.emojis) },
      summary,
      false,
      true,
      payoutData
    );

    await client.chat.update({
      channel: line.slack_channel_id,
      ts: line.slack_message_ts,
      text: msg.text,
      blocks: msg.blocks,
    });
    // Get all bettors by option
    const allBettors = {};
    Object.keys(summary.betsByOption).forEach(option => {
      allBettors[option] = summary.betsByOption[option].map(bet => bet.username);
    });

    // Create winner/loser lists
    const winners = payoutData.payouts.map(p => p.username);
    const losers = allBettors[winningOption] ? [] : Object.keys(allBettors)
      .filter(opt => opt !== winningOption)
      .flatMap(opt => allBettors[opt]);

    // Create the message
    let message = `🎉 Betting Line "${line.question}" resolved!\n🏆 Winner: ${winningOption}\n💰 ${payoutData.message}`;

    if (winners.length > 0) {
      message += `\n📊 Winners: ${winners.join(', ')}`;
    }
    if (losers.length > 0) {
      message += `\n📉 Losers: ${losers.join(', ')}`;
    }

    message += `\n(ID: ${lineId})`;

    await respond({ 
      text: message, 
      response_type: 'in_channel' 
    });
  }

  // ---------- /bet stats ----------
  async handleStats(respond, body) {
    let user = await this.db.getUserBySlackId(body.user_id);
    if (!user) {
      const u = await this.app.client.users.info({ user: body.user_id });
      user = await this.db.createUser(body.user_id, u.user.real_name || u.user.name);
    }

    const s = await this.db.getUserStats(user.id);
    const net = s.total_winnings - (s.total_bets - s.balance + 20);

    await respond({
      text:
        `*Your Betting Stats*\n\n` +
        `💰 Balance: ${s.balance} units\n` +
        `🎯 Total Bets: ${s.total_bets}\n` +
        `🏆 Total Winnings: ${s.total_winnings} units\n` +
        `📊 Net: ${net} units`,
      response_type: 'ephemeral',
    });
  }

  // ---------- /bet leaderboard ----------
  async handleLeaderboard(respond, client, body) {
    if (!this.isAdmin(body.user_id)) {
      await respond({ text: 'Only admins can view the leaderboard.', response_type: 'ephemeral' });
      return;
    }

    const top = await this.db.getLeaderboard(10);
    let text = '*🏆 Betting Leaderboard*\n\n';
    top.forEach((u, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} *${u.username}* - ${u.balance} units (${u.total_winnings} winnings)\n`;
    });

    await respond({ text, response_type: 'ephemeral' });
  }

  // ---------- Reaction handler (fixed & tolerant) ----------
  async handleReactionAdded({ event, client, logger }) {
    try {
      const { item, user, reaction } = event;

      // Log every reaction event
      console.log('🔔 Reaction event received:', {
        reaction: reaction,
        user: user,
        channel: item?.channel,
        message_ts: item?.ts,
        item_type: item?.type
      });

      if (!item || item.type !== 'message' || !item.channel || !item.ts) {
        console.log('❌ Invalid reaction event - missing required fields');
        return;
      }

      // Fetch the message to confirm it's a betting card
      const history = await client.conversations.history({
        channel: item.channel,
        latest: item.ts,
        limit: 1,
        inclusive: true,
      });
      const msg = history.messages?.[0];

      console.log('📄 Message content check:', {
        has_message: !!msg,
        has_text: !!msg?.text,
        is_betting_line: msg?.text?.includes('**Betting Line**'),
        message_preview: msg?.text?.substring(0, 100) + '...'
      });

      if (!msg || !msg.text || !msg.text.includes('**Betting Line**')) {
        console.log('❌ Not a betting line message - ignoring');
        return;
      }

      // Replace lines 311-360 in src/handlers/slackHandlers.js with:

      // Extract line_id from message text
      const lineIdMatch = msg.text.match(/ID: ([a-f0-9-]+)/);
      if (!lineIdMatch) {
        console.log('❌ No line ID found in message text');
        return;
      }
      const lineId = lineIdMatch[1];

      console.log('🔍 Extracted line ID:', lineId);

      // Query by line_id instead of timestamp
      const line = await this.db.getBettingLine(lineId);
      if (!line) {
        console.log('❌ No betting line found with ID:', lineId);
        return;
      }

      console.log('✅ Found betting line:', {
        line_id: line.id,
        status: line.status,
        question: line.question
      });

      const options = parseList(line.options);
      const emojis = parseList(line.emojis);

      console.log('📊 Betting line data:', {
        line_id: line.id,
        status: line.status,
        options: options,
        emojis: emojis,
        raw_options: line.options,
        raw_emojis: line.emojis
      });

      if (line.status !== 'open') {
        console.log('❌ Betting line is not open - status:', line.status);
        return;
      }

      // Map Slack reaction names to Slack emoji strings
      const nameToEmoji = {
        a: ':a:', b: ':b:', c: ':c:', d: ':d:', e: ':e:', f: ':f:', g: ':g:', h: ':h:', i: ':i:', j: ':j:',
        white_check_mark: ':white_check_mark:', x: ':x:',
        chart_with_upwards_trend: ':chart_with_upwards_trend:', chart_with_downwards_trend: ':chart_with_downwards_trend:',
        trophy: ':trophy:', broken_heart: ':broken_heart:', handshake: ':handshake:'
      };
      const reactedEmoji = nameToEmoji[reaction] || `:${reaction}:`;

      console.log('🎯 Emoji matching:', {
        reaction_name: reaction,
        mapped_emoji: reactedEmoji,
        stored_emojis: emojis,
        trying_matches: emojis.map(e => `${e} === ${reactedEmoji}`)
      });

      // Match the Slack emoji string
      const optionIndex = emojis.findIndex((e) => e === reactedEmoji);

      console.log('🔍 Match result:', {
        option_index: optionIndex,
        found_match: optionIndex !== -1
      });

      if (optionIndex === -1) {
        console.log('❌ No matching emoji found');
        return;
      }

      const selectedOption = options[optionIndex];
      console.log('✅ Match found! Selected option:', selectedOption);

      // Ensure user exists
      let dbUser = await this.db.getUserBySlackId(user);
      if (!dbUser) {
        const u = await client.users.info({ user });
        dbUser = await this.db.createUser(user, u.user.real_name || u.user.name);
      }

      // Place bet
      try {
        await this.bettingService.placeBet(dbUser.id, line.id, selectedOption);

        // Update card
        const summary = await this.bettingService.getLineSummary(line.id);
        const updatedMsg = this.formatBettingLineMessage(
          { ...line, options, emojis },
          summary,
          false
        );

        await client.chat.update({
          channel: item.channel,
          ts: item.ts,
          text: updatedMsg.text,
          blocks: updatedMsg.blocks,
        });

        await client.chat.postEphemeral({
          channel: item.channel,
          user,
          text: `:tada: Confirmed! You bet 1 unit on "${selectedOption}" for "${line.question}"!`,
        });
      } catch (err) {
        logger?.error(err);
        await client.chat.postEphemeral({
          channel: item.channel,
          user,
          text: `❌ ${err.message}`,
        });
      }
    } catch (e) {
      console.error('Error handling reaction_added:', e);
    }
  }

  // Add this method after line 427 in src/handlers/slackHandlers.js:
async handleReactionRemoved({ event, client, logger }) {
  try {
    const { item, user, reaction } = event;
    
    console.log('🔔 Reaction removed event:', {
      reaction: reaction,
      user: user,
      channel: item?.channel,
      message_ts: item?.ts
    });

    if (!item || item.type !== 'message' || !item.channel || !item.ts) {
      console.log('❌ Invalid reaction removal event');
      return;
    }

    // Get the message
    const history = await client.conversations.history({
      channel: item.channel,
      latest: item.ts,
      limit: 1,
      inclusive: true,
    });
    const msg = history.messages?.[0];
    
    if (!msg || !msg.text || !msg.text.includes('**Betting Line**')) {
      console.log('❌ Not a betting line message');
      return;
    }

    // Extract line_id from message text
    const lineIdMatch = msg.text.match(/ID: ([a-f0-9-]+)/);
    if (!lineIdMatch) {
      console.log('❌ No line ID found in message');
      return;
    }
    const lineId = lineIdMatch[1];

    // Get the betting line
    const line = await this.db.getBettingLine(lineId);
    if (!line || line.status !== 'open') {
      console.log('❌ Betting line not found or not open');
      return;
    }

    // Get user
    let dbUser = await this.db.getUserBySlackId(user);
    if (!dbUser) {
      console.log('❌ User not found');
      return;
    }

    // Find the user's bet on this line
    const userBet = await this.db.getUserBetOnLine(dbUser.id, lineId);
    if (!userBet) {
      console.log('❌ User has no bet on this line');
      return;
    }

    // Map reaction to emoji string
    const nameToEmoji = {
      a: ':a:', b: ':b:', c: ':c:', d: ':d:', e: ':e:', f: ':f:', g: ':g:', h: ':h:', i: ':i:', j: ':j:',
      white_check_mark: ':white_check_mark:', x: ':x:',
      chart_with_upwards_trend: ':chart_with_upwards_trend:', chart_with_downwards_trend: ':chart_with_downwards_trend:',
      trophy: ':trophy:', broken_heart: ':broken_heart:', handshake: ':handshake:'
    };
    const reactedEmoji = nameToEmoji[reaction] || `:${reaction}:`;

    // Check if the removed reaction matches their bet
    const options = parseList(line.options);
    const emojis = parseList(line.emojis);
    const optionIndex = emojis.findIndex((e) => e === reactedEmoji);
    
    if (optionIndex === -1) {
      console.log('❌ Removed reaction does not match any option');
      return;
    }

    const selectedOption = options[optionIndex];
    if (userBet.option !== selectedOption) {
      console.log('❌ Removed reaction does not match user\'s bet');
      return;
    }

    // Remove the bet and refund the user
    await this.db.db.run('DELETE FROM bets WHERE id = ?', [userBet.id]);
    
    // Refund the bet amount
    const newBalance = dbUser.balance + userBet.amount;
    await this.db.updateUserBalance(dbUser.id, newBalance);
    await this.db.incrementUserStats(dbUser.id, 'total_bets', -1);

    // Update the message
    const summary = await this.bettingService.getLineSummary(lineId);
    const updatedMsg = this.formatBettingLineMessage(
      { ...line, options, emojis },
      summary,
      false
    );

    await client.chat.update({
      channel: item.channel,
      ts: item.ts,
      text: updatedMsg.text,
      blocks: updatedMsg.blocks,
    });

    // Send confirmation
    await client.chat.postEphemeral({
      channel: item.channel,
      user,
      text: `🔄 Bet removed! Your bet on "${selectedOption}" for "${line.question}" has been cancelled. Your balance is now ${newBalance} units.`,
    });

    console.log('✅ Bet successfully removed');

  } catch (error) {
    console.error('Error handling reaction removal:', error);
  }
}

  // ---------- Render betting card ----------
  formatBettingLineMessage(line, summary = null, isLocked = false, isResolved = false, payoutData = null) {
    const options = parseList(line.options);
    const emojis  = parseList(line.emojis);

    let status = '🟢 Open for betting';
    if (isLocked) status = '🔒 Locked';
    if (isResolved) status = '✅ Resolved';

    let text = `🎯 **Betting Line** (ID: ${line.id})\n\n${line.question}\n\n`;
    options.forEach((opt, i) => {
      text += `${emojis[i] || ''} ${opt}\n`;
    });

    text += `\n\n\n Current Status: ${status}`;

    if (summary) {
      text += `\n\n--------- Current Bets: ---------\n`;
      options.forEach((opt, i) => {
        const c = (summary.betsByOption?.[opt] || []).length;
        text += `${emojis[i] || ''} ${opt}: ${c} bet${c === 1 ? '' : 's'}\n`;
      });
      text += `\n💰 Total Pot: ${summary.totalPot ?? 0} units`;
    }

    if (isResolved && payoutData) {
      text += `\n\n🏆 **Winner: ${line.winner_option}**\n`;
      if (payoutData.payouts?.length) {
        text += `\n🎉 **Payouts:**\n`;
        payoutData.payouts.forEach((p) => {
          text += `• ${p.username}: +${p.payout} units\n`;
        });
      }
      if (payoutData.message) text += `\n${payoutData.message}`;
    }

    return {
      text,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
    };
  }

  // ---------- Helpers ----------
  getHelpText() {
    return (
      `*🎯 Slack Betting Bot Commands*\n\n` +
      `*Admin Commands:*\n` +
      `• \`/bet create "question" options: opt1, opt2, opt3\` - Create a new betting line\n` +
      `• \`/bet lock <line_id>\` - Lock a betting line\n` +
      `• \`/bet resolve <line_id> winner: <option>\` - Resolve a betting line\n` +
      `• \`/bet leaderboard\` - View the leaderboard\n\n` +
      `*User Commands:*\n` +
      `• \`/bet stats\` - View your betting stats\n` +
      `• React with emojis to place bets on open lines\n\n` +
      `*How to Bet:*\n` +
      `1) Wait for a betting line to be created\n` +
      `2) React with the emoji next to your chosen option\n` +
      `3) Each bet costs 1 unit\n` +
      `4) Winners split the pot from losers`
    );
  }

  isAdmin(_userId) { return true; } // allow all for local testing

  handleError(error) { console.error('Slack app error:', error); }

  async start() {
    await this.app.start(process.env.PORT || 3000);
    console.log('⚡️ Slack Betting Bot is running!');
  }
}

module.exports = SlackHandlers;
