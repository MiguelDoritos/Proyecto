const socket = io();

socket.on('sensorData', (data) => {
    const container = document.getElementById('sensorData');
    const item = document.createElement('div');
    item.textContent = `${data.topic}: ${data.message}`;
    container.appendChild(item);
});
