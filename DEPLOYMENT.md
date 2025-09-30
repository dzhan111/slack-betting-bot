# 🚀 Deployment Guide

This guide will help you deploy your Slack Betting Bot to production.

## 📋 Prerequisites

- Node.js 16+ installed
- A Slack workspace with admin permissions
- A hosting service (Heroku, Railway, DigitalOcean, etc.)
- Domain name (optional, for custom webhooks)

## 🔧 Slack App Setup

### 1. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name your app: "Betting Bot" (or your preferred name)
4. Select your workspace

### 2. Configure OAuth & Permissions

Go to "OAuth & Permissions" and add these Bot Token Scopes:

```
app_mentions:read
channels:history
chat:write
commands
reactions:read
users:read
```

### 3. Create Slash Command

Go to "Slash Commands" and create:

- **Command**: `/bet`
- **Request URL**: `https://your-domain.com/slack/events` (update after deployment)
- **Short Description**: `Betting bot commands`
- **Usage Hint**: `create "question" options: opt1, opt2`

### 4. Enable Socket Mode

1. Go to "Socket Mode" and enable it
2. Generate an App Token with `connections:write` scope
3. Copy the App Token

### 5. Install App to Workspace

1. Go to "Install App" 
2. Click "Install to Workspace"
3. Copy the Bot User OAuth Token

## 🌐 Deployment Options

### Option 1: Heroku (Recommended)

1. **Install Heroku CLI** and login:
   ```bash
   heroku login
   ```

2. **Create Heroku app**:
   ```bash
   heroku create your-betting-bot
   ```

3. **Set environment variables**:
   ```bash
   heroku config:set SLACK_BOT_TOKEN=xoxb-your-token
   heroku config:set SLACK_SIGNING_SECRET=your-signing-secret
   heroku config:set SLACK_APP_TOKEN=xapp-your-app-token
   heroku config:set NODE_ENV=production
   ```

4. **Deploy**:
   ```bash
   git add .
   git commit -m "Initial deployment"
   git push heroku main
   ```

5. **Update Slack app** with your Heroku URL:
   - Request URL: `https://your-betting-bot.herokuapp.com/slack/events`

### Option 2: Railway

1. **Connect GitHub** to Railway
2. **Create new project** from your repository
3. **Set environment variables** in Railway dashboard
4. **Deploy** automatically on push

### Option 3: DigitalOcean App Platform

1. **Create new app** from GitHub
2. **Configure environment variables**
3. **Deploy** with automatic builds

## 🔐 Environment Variables

Create a `.env` file with these variables:

```env
# Required
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# Optional
PORT=3000
DATABASE_PATH=./data/betting.db
DEFAULT_BALANCE=20
NODE_ENV=production
```

## 🗄️ Database Considerations

### SQLite (Default)
- Good for small to medium teams
- File-based, no external dependencies
- Included in the deployment

### PostgreSQL (Production)
For larger teams, consider upgrading to PostgreSQL:

1. **Install pg**:
   ```bash
   npm install pg
   ```

2. **Update database schema** to use PostgreSQL
3. **Set DATABASE_URL** environment variable

## 🔍 Monitoring & Logs

### Heroku
```bash
# View logs
heroku logs --tail

# Check app status
heroku ps
```

### Railway
- View logs in Railway dashboard
- Monitor metrics and performance

## 🛠️ Maintenance

### Backup Database
```bash
# SQLite backup
cp data/betting.db backup/betting-$(date +%Y%m%d).db
```

### Update Bot
```bash
# Pull latest changes
git pull origin main

# Deploy
git push heroku main
```

### Reset Database (if needed)
```bash
# Connect to your server
heroku run bash

# Remove database file
rm data/betting.db

# Restart app
heroku restart
```

## 🚨 Troubleshooting

### Common Issues

1. **Bot not responding**:
   - Check environment variables
   - Verify Slack app permissions
   - Check logs for errors

2. **Database errors**:
   - Ensure write permissions
   - Check disk space
   - Verify database file exists

3. **Reactions not working**:
   - Verify `reactions:read` permission
   - Check message timestamps
   - Ensure bot is in the channel

### Debug Mode

Set `NODE_ENV=development` for detailed logging:

```bash
heroku config:set NODE_ENV=development
```

## 📊 Scaling Considerations

### Small Team (< 50 users)
- SQLite database
- Single instance
- Basic monitoring

### Medium Team (50-500 users)
- Consider PostgreSQL
- Multiple instances
- Database backups
- Performance monitoring

### Large Team (500+ users)
- PostgreSQL database
- Load balancing
- Redis for caching
- Comprehensive monitoring
- Database clustering

## 🔒 Security Best Practices

1. **Environment Variables**: Never commit tokens to git
2. **Database**: Regular backups and access control
3. **Logs**: Don't log sensitive information
4. **Updates**: Keep dependencies updated
5. **Monitoring**: Set up alerts for errors

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section
2. Review Slack app configuration
3. Check application logs
4. Verify environment variables
5. Test with a small group first

## 🎉 You're Ready!

Your Slack Betting Bot is now deployed and ready to use! 

- Test with a small group first
- Monitor logs for any issues
- Enjoy casual betting in your workspace!

Remember to follow your organization's policies regarding gambling and betting activities.
