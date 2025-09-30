const Database = require('../database/schema');

class BettingService {
  constructor(db) {
    this.db = db;
  }

  // Calculate payouts for a resolved betting line
  async calculatePayouts(lineId, winningOption) {
    const line = await this.db.getBettingLine(lineId);
    if (!line) {
      throw new Error('Betting line not found');
    }

    const bets = await this.db.getBetsForLine(lineId);
    
    // Group bets by option
    const betsByOption = {};
    bets.forEach(bet => {
      if (!betsByOption[bet.option]) {
        betsByOption[bet.option] = [];
      }
      betsByOption[bet.option].push(bet);
    });

    const winningBets = betsByOption[winningOption] || [];
    const losingBets = Object.keys(betsByOption)
      .filter(option => option !== winningOption)
      .flatMap(option => betsByOption[option]);

    // Calculate total pot from losing bets
    const totalPot = losingBets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // If no winners, pot is retained by the bot
    if (winningBets.length === 0) {
      return {
        payouts: [],
        totalPot,
        message: 'No one bet on the winning option. Pot retained by the bot.'
      };
    }

    // If no losers, no payouts
    if (losingBets.length === 0) {
      return {
        payouts: winningBets.map(bet => ({
          userId: bet.user_id,
          username: bet.username,
          payout: 0,
          originalBet: bet.amount
        })),
        totalPot: 0,
        message: 'Everyone bet on the winning option. No payouts.'
      };
    }

    // Calculate payout per winner (round down to avoid fractional units)
    const payoutPerWinner = Math.floor(totalPot / winningBets.length);
    const remainder = totalPot % winningBets.length;

    const payouts = winningBets.map(bet => ({
      userId: bet.user_id,
      username: bet.username,
      payout: payoutPerWinner,
      originalBet: bet.amount
    }));

    return {
      payouts,
      totalPot,
      payoutPerWinner,
      remainder,
      message: `Winners receive ${payoutPerWinner} units each. ${remainder} units remain in bot pool.`
    };
  }

  // Process payouts and update user balances
  async processPayouts(lineId, winningOption) {
    const payoutData = await this.calculatePayouts(lineId, winningOption);
    
    // Update user balances
    for (const payout of payoutData.payouts) {
      const user = await this.db.getUserStats(payout.userId);
      if (user) {
        const newBalance = user.balance + payout.payout;
        await this.db.updateUserBalance(payout.userId, newBalance);
        await this.db.incrementUserStats(payout.userId, 'total_winnings', payout.payout);
      }
    }

    // Deduct from losers
    const bets = await this.db.getBetsForLine(lineId);
    const losingBets = bets.filter(bet => bet.option !== winningOption);
    
    for (const bet of losingBets) {
      const user = await this.db.getUserStats(bet.user_id);
      if (user) {
        const newBalance = Math.max(0, user.balance - bet.amount);
        await this.db.updateUserBalance(bet.user_id, newBalance);
      }
    }

    return payoutData;
  }

  // Validate if a user can place a bet
  async canUserBet(userId, lineId) {
    const user = await this.db.getUserStats(userId);
    const line = await this.db.getBettingLine(lineId);
    const existingBet = await this.db.getUserBetOnLine(userId, lineId);

    if (!user) {
      throw new Error('User not found');
    }

    if (!line) {
      throw new Error('Betting line not found');
    }

    if (line.status !== 'open') {
      throw new Error('This betting line is no longer accepting bets');
    }

    if (existingBet) {
      throw new Error('You have already placed a bet on this line');
    }

    if (user.balance < 1) {
      throw new Error('Insufficient balance to place a bet');
    }

    return true;
  }

  // Place a bet
  // In src/services/bettingService.js, replace the placeBet method (lines 131-144):
async placeBet(userId, lineId, option) {
  // Check if user already has a bet on this line
  const existingBet = await this.db.getUserBetOnLine(userId, lineId);
  
  if (existingBet) {
    // If they're betting on the same option, do nothing
    if (existingBet.option === option) {
      throw new Error('You have already bet on this option');
    }
    
    // If they're changing their bet, remove the old one and refund
    await this.db.db.run('DELETE FROM bets WHERE id = ?', [existingBet.id]);
    
    const user = await this.db.getUserStats(userId);
    const newBalance = user.balance + existingBet.amount;
    await this.db.updateUserBalance(userId, newBalance);
    await this.db.incrementUserStats(userId, 'total_bets', -1);
  }

  // Check other validations
  const user = await this.db.getUserStats(userId);
  if (user.balance < 1) {
    throw new Error('Insufficient balance to place a bet');
  }

  const line = await this.db.getBettingLine(lineId);
  if (!line || line.status !== 'open') {
    throw new Error('This betting line is no longer accepting bets');
  }

  // Place the new bet
  const newBalance = user.balance - 1;
  await this.db.updateUserBalance(userId, newBalance);
  await this.db.incrementUserStats(userId, 'total_bets', 1);

  const bet = await this.db.placeBet(userId, lineId, option);
  
  return bet;
}

  // Get betting line summary
  async getLineSummary(lineId) {
    const line = await this.db.getBettingLine(lineId);
    if (!line) {
      throw new Error('Betting line not found');
    }

    const bets = await this.db.getBetsForLine(lineId);
    
    // Group bets by option
    const betsByOption = {};
    line.options.forEach(option => {
      betsByOption[option] = [];
    });

    bets.forEach(bet => {
      if (betsByOption[bet.option]) {
        betsByOption[bet.option].push(bet);
      }
    });

    return {
      line,
      betsByOption,
      totalBets: bets.length,
      totalPot: bets.reduce((sum, bet) => sum + bet.amount, 0)
    };
  }

  // Generate emoji options for betting lines
  generateEmojis(options) {
    const defaultEmojis = [':a:', ':b:', ':c:', ':d:', ':e:', ':f:', ':g:', ':h:', ':i:', ':j:'];
    const customEmojis = {
      'yes': ':white_check_mark:',
      'no': ':x:',
      'over': ':chart_with_upwards_trend:',
      'under': ':chart_with_downwards_trend:',
      'win': ':trophy:',
      'lose': ':broken_heart:',
      'tie': ':handshake:'
    };
  
    return options.map((option, index) => {
      const lowerOption = option.toLowerCase();
      return customEmojis[lowerOption] || defaultEmojis[index] || `:${index + 1}:`;
    });
  }
}

module.exports = BettingService;
