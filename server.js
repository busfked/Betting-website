const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => {
    res.send('System is Online! 🚀');
});

app.post('/api/deposit', async (req, res) => {
    const { phoneNumber, amount, screenshotUrl } = req.body;
    await supabase.from('player_wallets').upsert({ phone_number: phoneNumber }, { onConflict: 'phone_number' });
    const { error } = await supabase.from('player_bets').insert([{ phone_number: phoneNumber, bet_amount: amount, screenshot_url: screenshotUrl, status: 'Pending Deposit' }]);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Deposit logged successfully!" });
});

app.get('/api/dashboard/:phone', async (req, res) => {
    const { phone } = req.params;
    const { data, error } = await supabase.from('player_wallets').select('*').eq('phone_number', phone).single();
    if (error || !data) return res.json({ balance: 0, total_won: 0, total_lost: 0 });
    res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Active`));
