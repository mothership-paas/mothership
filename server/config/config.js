require('dotenv').config();

module.exports = {
  development: {
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.PASSWORD,
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: 5432,
  },
  "test": {
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.PASSWORD,
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: 5432,
  },
  "production": {
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.PASSWORD,
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: 5432,
  }
}