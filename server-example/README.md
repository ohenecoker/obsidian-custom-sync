# Sync Server Example

This is a basic example of a sync server that works with the Obsidian Custom Sync Plugin.

## Full Server Implementation

For the complete server implementation, please visit:
https://github.com/obsidian-sync-plugin/sync-server

## Basic Server Requirements

The sync server must implement these endpoints:

### Authentication
- `POST /register` - Register new user
- `POST /login` - Login and receive JWT token

### Vault Management
- `POST /vault` - Create/access vault
- `GET /vaults` - List user's vaults

### Synchronization
- `POST /sync/pull` - Pull changes from server
- `POST /sync/push` - Push changes to server

## Example Server Structure

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3');

const app = express();
app.use(express.json());

// Middleware for JWT authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.sendStatus(401);
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Routes implementation...
```

## Database Schema

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
);

CREATE TABLE vaults (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    vault_id INTEGER,
    path TEXT NOT NULL,
    content TEXT,
    modified_time INTEGER,
    deleted BOOLEAN DEFAULT 0,
    FOREIGN KEY (vault_id) REFERENCES vaults(id)
);
```

## Security Considerations

1. Use HTTPS in production
2. Store passwords hashed with bcrypt
3. Use strong JWT secrets
4. Implement rate limiting
5. Validate all input data

## Testing

Test your server with curl:

```bash
# Register
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# Login
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# Create vault (use token from login)
curl -X POST http://localhost:3001/vault \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vaultName":"MyVault"}'
```