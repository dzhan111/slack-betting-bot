const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor(dbPath) {
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath);
  }

  async init() {
    return new Promise((resolve, reject) => {
      // Users table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          slack_user_id TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          balance INTEGER DEFAULT 20,
          total_bets INTEGER DEFAULT 0,
          total_winnings INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
        
        // Betting lines table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS betting_lines (
            id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            options TEXT NOT NULL, -- JSON array of options
            emojis TEXT NOT NULL, -- JSON array of corresponding emojis
            status TEXT DEFAULT 'open', -- 'open', 'locked', 'resolved'
            winner_option TEXT, -- The winning option when resolved
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            locked_at DATETIME,
            resolved_at DATETIME,
            slack_message_ts TEXT, -- Slack message timestamp
            slack_channel_id TEXT -- Slack channel ID
          )
        `, (err) => {
          if (err) return reject(err);
          
          // Bets table
          this.db.run(`
            CREATE TABLE IF NOT EXISTS bets (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              line_id TEXT NOT NULL,
              option TEXT NOT NULL,
              amount INTEGER DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users (id),
              FOREIGN KEY (line_id) REFERENCES betting_lines (id)
            )
          `, (err) => {
            if (err) return reject(err);
            
            // Create indexes for better performance
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets (user_id)`, (err) => {
              if (err) return reject(err);
              
              this.db.run(`CREATE INDEX IF NOT EXISTS idx_bets_line_id ON bets (line_id)`, (err) => {
                if (err) return reject(err);
                
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_slack_id ON users (slack_user_id)`, (err) => {
                  if (err) return reject(err);
                  else resolve();
                });
              });
            });
          });
        });
      });
    });
  }


  // User methods
  async getUserBySlackId(slackUserId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE slack_user_id = ?',
        [slackUserId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async createUser(slackUserId, username) {
    const id = require('uuid').v4();
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (id, slack_user_id, username) VALUES (?, ?, ?)',
        [id, slackUserId, username],
        function(err) {
          if (err) reject(err);
          else resolve({ id, slack_user_id: slackUserId, username });
        }
      );
    });
  }

  async updateUserBalance(userId, newBalance) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET balance = ? WHERE id = ?',
        [newBalance, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async incrementUserStats(userId, field, amount = 1) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE users SET ${field} = ${field} + ? WHERE id = ?`,
        [amount, userId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Betting line methods
  async createBettingLine(question, options, emojis, createdBy, slackMessageTs, slackChannelId) {
    const id = require('uuid').v4();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO betting_lines (id, question, options, emojis, created_by, slack_message_ts, slack_channel_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, question, JSON.stringify(options), JSON.stringify(emojis), createdBy, slackMessageTs, slackChannelId],
        function(err) {
          if (err) reject(err);
          else resolve({ id, question, options, emojis });
        }
      );
    });
  }

  async getBettingLine(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM betting_lines WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else if (row) {
            row.options = JSON.parse(row.options);
            row.emojis = JSON.parse(row.emojis);
            resolve(row);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async updateBettingLineStatus(id, status, additionalFields = {}) {
    const fields = Object.keys(additionalFields).map(key => `${key} = ?`).join(', ');
    const values = Object.values(additionalFields);
    const query = `UPDATE betting_lines SET status = ?, ${fields} WHERE id = ?`;
    
    return new Promise((resolve, reject) => {
      this.db.run(query, [status, ...values, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Bet methods
  async placeBet(userId, lineId, option) {
    const id = require('uuid').v4();
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO bets (id, user_id, line_id, option) VALUES (?, ?, ?, ?)',
        [id, userId, lineId, option],
        function(err) {
          if (err) reject(err);
          else resolve({ id, user_id: userId, line_id: lineId, option });
        }
      );
    });
  }

  async getUserBetOnLine(userId, lineId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM bets WHERE user_id = ? AND line_id = ?',
        [userId, lineId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getBetsForLine(lineId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT b.*, u.username FROM bets b JOIN users u ON b.user_id = u.id WHERE b.line_id = ?',
        [lineId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Stats methods
  async getLeaderboard(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT username, balance, total_bets, total_winnings 
         FROM users 
         ORDER BY balance DESC, total_winnings DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getUserStats(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;
