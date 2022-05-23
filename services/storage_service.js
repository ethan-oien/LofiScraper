const os = require('os');
const keytar = require('keytar');

const keytar_account = os.userInfo().username;

async function get_value(key) {
    return keytar.getPassword(key, keytar_account);
}

async function set_value(key, value) {
    await keytar.setPassword(key, keytar_account, value);
}

async function clear_value(key) {
    await keytar.deletePassword(key, keytar_account);
}

module.exports = {
    get_value,
    set_value,
    clear_value
}