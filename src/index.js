require('dotenv').config();
const SlackHandlers = require('./handlers/slackHandlers');

(async () => {
  // Validate required environment variables
  const requiredEnvVars = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\nPlease copy env.example to .env and fill in the required values.');
    process.exit(1);
  }

  try {
    // Initialize DB and register handlers before starting
    const slackHandlers = await SlackHandlers.create();
    await slackHandlers.start();
  } catch (error) {
    console.error('Failed to start Slack bot:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Slack Betting Bot...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down Slack Betting Bot...');
    process.exit(0);
  });
})();
