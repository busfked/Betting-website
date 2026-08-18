const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());

// Enable CORS so your GitHub Pages frontend can talk to your Render backend
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Submit a Deposit Request (Screenshot Upload)
app.post('/api/deposit', async (req, res) => {
    const { phoneNumber, amount, screenshotUrl } = req.body;
    
    // Create or find wallet
    await supabase.from('player_wallets').upsert({ phone_number: phoneNumber }, { onConflict: 'phone_number' });

    // Log the pending deposit for admin approval
    const { error } = await supabase
        .from('player_bets') // Reusing this table to log deposits for simplicity
        .insert([{ phone_number: phoneNumber, bet_amount: amount, screenshot_url: screenshotUrl, status: 'Pending Deposit' }]);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Deposit submitted! Once admin verifies the screenshot, your ETB balance will update." });
});

// 2. Play Using Dashboard Balance (No Screenshot Needed Here!)
app.post('/api/play-round', async (req, res) => {
    const { phoneNumber, chosenNumbers, betAmount } = req.body;

    if (betAmount > 300 || betAmount < 5) {
        return res.status(400).json({ error: "Bet must be between 5 and 300 ETB" });
    }

    // Fetch the player's active wallet balance
    const { data: wallet, error: walletError } = await supabase
        .from('player_wallets')
        .select('balance, total_lost')
        .eq('phone_number', phoneNumber)
        .single();

    if (walletError || !wallet || wallet.balance < betAmount) {
        return res.status(400).json({ error: "Insufficient balance! Balance is 0 ETB or too low. Please deposit more funds." });
    }

    // Deduct the bet amount from their dashboard balance immediately
    const newBalance = wallet.balance - betAmount;
    const newLosses = wallet.total_lost + betAmount;
    
    await supabase
        .from('player_wallets')
        .update({ balance: newBalance, total_lost: newLosses })
        .eq('phone_number', phoneNumber);

    // Save the round logs to the database
    await supabase
        .from('player_bets')
        .insert([{ phone_number: phoneNumber, chosen_numbers: chosenNumbers, bet_amount: betAmount, status: 'Played' }]);

    res.json({ 
        message: `Bet placed! ${betAmount} ETB deducted. Remaining: ${newBalance} ETB.`,
        currentBalance: newBalance
    });
});

// 3. Get Dashboard Profile info
app.get('/api/dashboard/:phone', async (req, res) => {
    const { phone } = req.params;
    const { data, error } = await supabase.from('player_wallets').select('*').eq('phone_number', phone).single();
    if (error || !data) return res.json({ balance: 0, total_won: 0, total_lost: 0 });
    res.json(data);
});

// 4. Request Withdrawal
app.post('/api/request-withdrawal', async (req, res) => {
    const { phoneNumber, amount } = req.body;
    const { data: wallet } = await supabase.from('player_wallets').select('balance').eq('phone_number', phoneNumber).single();

    if (!wallet || wallet.balance < amount) return res.status(400).json({ error: "Insufficient balance." });

    await supabase.from('player_wallets').update({ balance: wallet.balance - amount }).eq('phone_number', phoneNumber);
    await supabase.from('withdrawal_requests').insert([{ phone_number: phoneNumber, amount: amount }]);

    res.json({ message: "Withdrawal request submitted successfully!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`System running live on port ${PORT}`));
