import mysql from 'mysql2/promise';

export const conn = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

export async function testDB() {
    try {
        const [rows] = await conn.query('SELECT NOW() as now');
        console.log('[DB] connected at', (rows as any)[0].now);
    } catch (err) {
        console.error('[DB] connection error', err);
    }
}
