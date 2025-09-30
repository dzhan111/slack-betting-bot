# 🎯 Slack Betting Bot

A Slack bot that enables casual, low-stakes betting within your workspace. Users place bets via emoji reactions, and admins manage betting lines and outcomes.

## ✨ Features

- **Betting Line Creation**: Admins create betting lines with custom questions and options
- **Emoji Betting**: Users place bets by reacting with emojis
- **Balance Tracking**: Each user has a balance and betting history
- **Payout System**: Winners split the pot from losers
- **Leaderboard**: Track top bettors in your workspace
- **Real-time Updates**: Messages update as bets are placed

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 16+ 
- A Slack workspace where you can create apps
- Admin permissions in your Slack workspace

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name your app and select your workspace
4. Go to "OAuth & Permissions" and add these scopes:
   - `app_mentions:read`
   - `channels:history`
   - `chat:write`
   - `commands`
   - `reactions:read`
   - `users:read`
5. Go to "Slash Commands" and create a command:
   - Command: `/bet`
   - Request URL: `https://your-domain.com/slack/events`
   - Short Description: `Betting bot commands`
6. Go to "Socket Mode" and enable it
7. Copy your tokens to `.env` file

### 4. Configure Environment

```bash
cp env.example .env
```

Edit `.env` with your Slack app credentials:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
PORT=3000
DATABASE_PATH=./data/betting.db
DEFAULT_BALANCE=20
```

### 5. Run the Bot

```bash
# Development
npm run dev

# Production
npm start
```

## 📖 Usage

### Admin Commands

Create a betting line:
```
/bet create "Will Team A score over 100?" options: over, under
```

Lock a betting line (stops accepting new bets):
```
/bet lock <line_id>
```

Resolve a betting line (declare winner):
```
/bet resolve <line_id> winner: over
```

View leaderboard:
```
/bet leaderboard
```

### User Commands

View your stats:
```
/bet stats
```

Place a bet:
- React to a betting line message with the emoji next to your chosen option
- Each bet costs 1 unit
- You can only bet once per line

## 🎮 How It Works

1. **Admin creates a betting line** with a question and options
2. **Bot posts a message** with emoji options for each choice
3. **Users react with emojis** to place their bets (1 unit each)
4. **Admin locks the line** when betting should stop
5. **Admin resolves the line** by declaring the winner
6. **Bot calculates payouts** - winners split the pot from losers
7. **User balances are updated** automatically

## 🏗️ Architecture

- **Database**: SQLite for persistence (users, betting lines, bets)
- **Slack API**: Bolt framework for Slack integration
- **Betting Logic**: Custom service for calculations and payouts
- **Real-time Updates**: Messages update as bets are placed

## 🔧 Configuration

### Default Settings

- Starting balance: 20 units per user
- Bet amount: 1 unit per bet
- Payout: Winners split the pot from losers
- Database: SQLite file in `./data/betting.db`

### Customization

You can modify these settings in the code:
- Default user balance in `src/database/schema.js`
- Bet amount in `src/services/bettingService.js`
- Emoji generation in `src/services/bettingService.js`

## 🛡️ Security

- Admin commands require admin permissions
- Users can only bet once per line
- Balance validation prevents overdrafts
- Input validation on all commands

## 🐛 Troubleshooting

### Common Issues

1. **Bot not responding**: Check your tokens and app permissions
2. **Database errors**: Ensure the `data/` directory is writable
3. **Reactions not working**: Verify the bot has `reactions:read` permission

### Debug Mode

Set `NODE_ENV=development` for detailed logging.

## 📝 License

MIT License - feel free to modify and distribute!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section
2. Review Slack app permissions
3. Check the console logs for errors
4. Open an issue with details
