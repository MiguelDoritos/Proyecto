const sql = require('mssql');

const config = {
    user: 'Miguel',
    password: '123SQL',
    server: 'localhost',
    database: 'sensores',
    port: 54148,
    options: {
        encrypt: false,
        enableArithAbort: true,
        trustServerCertificate: true
    },
    requestTimeout: 30000,
    connectionTimeout: 30000
};

async function testConnection() {
    try {
        await sql.connect(config);
        console.log('✅ Conexión exitosa a SQL Server');
        sql.close();
    } catch (err) {
        console.error('❌ Error al conectar a SQL Server:', err);
    }
}

testConnection();