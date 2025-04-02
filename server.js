require('dotenv').config();

const express = require('express');
const http = require('http');
const mqtt = require('mqtt');
const socketIO = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configuración de conexión a PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

// Conexión MQTT
const client = mqtt.connect(process.env.MQTT_BROKER);

// Cola para evitar pérdida de datos
let insertQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (insertQueue.length > 0) {
        const { topic, message } = insertQueue.shift();
        await insertData(topic, message);
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    isProcessingQueue = false;
}

async function insertData(topic, message) {
    try {
        const query = `
            INSERT INTO sensores (topic, message, fecha_hora)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
        `;
        await pool.query(query, [topic, message]);
        console.log('✅ Dato insertado:', topic, message);
    } catch (err) {
        console.error('❌ Error al insertar en PostgreSQL:', err);
    }
}

client.on('connect', () => {
    client.subscribe('devices/ESP32_001/sensors/#', err => {
        if (err) console.error('❌ Error al suscribirse al tópico:', err);
        else console.log('📡 Subscrito a tópico MQTT');
    });
});

client.on('message', (topic, message) => {
    const timestamp = Date.now();
    const data = { topic, message: message.toString(), timestamp };

    console.log(`📩 Mensaje MQTT: ${topic} - ${data.message}`);
    io.emit('sensorData', data);
    insertQueue.push(data);
    processQueue();
});

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API historial completo
app.get('/api/historial', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sensores ORDER BY fecha_hora DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error al obtener historial');
    }
});

// API por fecha
app.get('/api/historial/fecha', async (req, res) => {
    const fecha = req.query.fecha;
    if (!fecha) return res.status(400).send('Falta fecha');

    try {
        const result = await pool.query(`
            SELECT * FROM sensores
            WHERE DATE(fecha_hora) = $1
            ORDER BY fecha_hora DESC
        `, [fecha]);

        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error al obtener historial por fecha');
    }
});

// Últimos datos por tópico
app.get('/api/ultimos-datos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT ON (topic) *
            FROM sensores
            ORDER BY topic, fecha_hora DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error al obtener últimos datos');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Servidor corriendo en http://localhost:${PORT}`);
});

