const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://test.mosquitto.org");

function EventoConectar() {
    client.subscribe('PrycHM/#', function (err) {

    })
}

function EventoMensaje(topic, message) {
    if (topic == "PrycHM/Ph") {
        console.log("El PH es de " + message.toString());
    }
    if (topic == "PrycHM/Turbidez") {
        console.log("La turbidez es de " + message.toString());
    }
    console.log(topic + " - " + message.toString())
}

client.on('connect', EventoConectar)
client.on('message', EventoMensaje)