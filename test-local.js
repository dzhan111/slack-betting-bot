#!/usr/bin/env node

// Simple test script to demonstrate the bot functionality
const Database = require('./src/database/schema');
const BettingService = require('./src/services/bettingService');

async function demonstrateBot() {
  console.log('🎯 Slack Betting Bot - Local Demo\n');

  // Initialize database
  const db = new Database('./demo.db');
  await db.init();
  const bettingService = new BettingService(db);

  try {
    // Create some demo users
    console.log('👥 Creating demo users...');
    const alice = await db.createUser('alice_slack', 'Alice');
    const bob = await db.createUser('bob_slack', 'Bob');
    const charlie = await db.createUser('charlie_slack', 'Charlie');
    console.log('✅ Users created: Alice, Bob, Charlie\n');

    // Create a betting line
    console.log('🎲 Creating betting line...');
    const options = ['over', 'under'];
    const emojis = bettingService.generateEmojis(options);
    const line = await db.createBettingLine(
      'Will the temperature be over 75°F tomorrow?',
      options,
      emojis,
      alice.id,
      'demo_message_ts',
      'demo_channel'
    );
    console.log(`✅ Betting line created: "${line.question}"`);
    console.log(`   Options: ${options.join(', ')}`);
    console.log(`   Emojis: ${emojis.join(', ')}\n`);

    // Show the betting line message
    console.log('📋 Betting Line Message:');
    console.log('─'.repeat(50));
    console.log(`🎯 **Betting Line**\n`);
    console.log(`${line.question}\n`);
    options.forEach((option, index) => {
      console.log(`${emojis[index]} ${option}`);
    });
    console.log(`\n🟢 Open for betting`);
    console.log('─'.repeat(50));
    console.log('💡 Users would react with emojis to place bets\n');

    // Simulate users placing bets
    console.log('🎯 Simulating bets...');
    
    // Alice bets on "over"
    await bettingService.placeBet(alice.id, line.id, 'over');
    console.log('✅ Alice bet on "over" (📈)');
    
    // Bob bets on "under" 
    await bettingService.placeBet(bob.id, line.id, 'under');
    console.log('✅ Bob bet on "under" (📉)');
    
    // Charlie bets on "over"
    await bettingService.placeBet(charlie.id, line.id, 'over');
    console.log('✅ Charlie bet on "over" (📈)\n');

    // Show current status
    const summary = await bettingService.getLineSummary(line.id);
    console.log('📊 Current Status:');
    console.log(`   Total bets: ${summary.totalBets}`);
    console.log(`   Total pot: ${summary.totalPot} units`);
    options.forEach((option, index) => {
      const bets = summary.betsByOption[option] || [];
      console.log(`   ${emojis[index]} ${option}: ${bets.length} bet${bets.length !== 1 ? 's' : ''}`);
    });
    console.log();

    // Simulate admin locking the line
    console.log('🔒 Admin locks the betting line...');
    await db.updateBettingLineStatus(line.id, 'locked', {
      locked_at: new Date().toISOString()
    });
    console.log('✅ Line locked - no more bets accepted\n');

    // Simulate admin resolving with "over" as winner
    console.log('🏆 Admin resolves: "over" wins!');
    const payoutData = await bettingService.processPayouts(line.id, 'over');
    await db.updateBettingLineStatus(line.id, 'resolved', {
      winner_option: 'over',
      resolved_at: new Date().toISOString()
    });

    console.log('💰 Payout Results:');
    console.log(`   Total pot: ${payoutData.totalPot} units`);
    console.log(`   Payout per winner: ${payoutData.payoutPerWinner} units`);
    console.log(`   Remainder: ${payoutData.remainder} units`);
    console.log();

    // Show final balances
    console.log('💳 Final Balances:');
    const finalAlice = await db.getUserStats(alice.id);
    const finalBob = await db.getUserStats(bob.id);
    const finalCharlie = await db.getUserStats(charlie.id);
    
    console.log(`   Alice: ${finalAlice.balance} units (started: 20, bet: 1, won: ${payoutData.payoutPerWinner})`);
    console.log(`   Bob: ${finalBob.balance} units (started: 20, bet: 1, lost: 1)`);
    console.log(`   Charlie: ${finalCharlie.balance} units (started: 20, bet: 1, won: ${payoutData.payoutPerWinner})`);
    console.log();

    // Show leaderboard
    console.log('🏆 Leaderboard:');
    const leaderboard = await db.getLeaderboard(3);
    leaderboard.forEach((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      console.log(`   ${medal} ${user.username} - ${user.balance} units`);
    });

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n📝 To test with real Slack:');
    console.log('   1. Set up your Slack app');
    console.log('   2. Add your tokens to .env file');
    console.log('   3. Run: npm start');
    console.log('   4. Use /bet commands in Slack!');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  } finally {
    // Cleanup
    db.close();
    require('fs').unlinkSync('./demo.db');
    console.log('\n🧹 Demo database cleaned up');
  }
}

// Run demo
demonstrateBot();
