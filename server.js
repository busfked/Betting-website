const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());

// Enable CORS so your GitHub Pages website can talk to your Render server
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
});

// Initialize connection with your Render environment variables
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Health check route
app.get('/', (req, res) => {
    res.send('Your Betting Backend Engine is Live and Secure! 💪');
});

// 1. Submit Deposit Route (Saves to player_bets table under 'username')
app.post('/api/deposit', async (req, res) => {
    const { phoneNumber, amount, screenshotUrl } = req.body;
    
    // Step A: Ensure the player profile row exists in wallets table
    await supabase.from('player_wallets').upsert({ phone_number: phoneNumber }, { onConflict: 'phone_number' });

    // Step B: Log deposit tracking entry to player_bets matching your schema column structure
    const { error } = await supabase
        .from('player_bets')
        .insert([{ username: phoneNumber, bet_amount: amount, screenshot_url: screenshotUrl, status: 'Pending Deposit' }]);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Deposit submitted! Once admin verifies the screenshot, your ETB balance will update." });
});

// 2. Play Round Route (Subtracts ETB from balance, logs chosen numbers)
app.post('/api/play-round', async (req, res) => {
    const { phoneNumber, chosenNumbers, betAmount } = req.body;

    // Enforce your specific safety limits
    if (betAmount > 300 || betAmount < 5) {
        return res.status(400).json({ error: "Bet must be between 5 and 300 ETB" });
    }

    // Check player's wallet balance
    const { data: wallet, error: walletError } = await supabase
        .from('player_wallets')
        .select('balance, total_lost')
        .eq('phone_number', phoneNumber)
        .single();

    if (walletError || !wallet || wallet.balance < betAmount) {
        return res.status(400).json({ error: "Insufficient balance! Please deposit ETB to your wallet first." });
    }

    // Deduct bet amount from their dashboard balance
    const newBalance = wallet.balance - betAmount;
    const newLosses = wallet.total_lost + betAmount;
    
    await supabase
        .from('player_wallets')
        .update({ balance: newBalance, total_lost: newLosses })
        .eq('phone_number', phoneNumber);

    // Save round record using 'username' column for phone number alignment
    await supabase
        .from('player_bets')
        .insert([{ username: phoneNumber, chosen_numbers: chosenNumbers, bet_amount: betAmount, status: 'Played' }]);

    res.json({ 
        message: `Bet placed! ${betAmount} ETB deducted. Remaining: ${newBalance} ETB.`,
        currentBalance: newBalance
    });
});

// 3. Load Dashboard Route (Fetches profile metrics)
app.get('/api/dashboard/:phone', async (req, res) => {
    const { phone } = req.params;
    const { data, error } = await supabase.from('player_wallets').select('*').eq('phone_number', phone).single();
    if (error || !data) return res.json({ balance: 0, total_won: 0, total_lost: 0 });
    res.json(data);
});

// 4. Request Withdrawal Route (Deducts balance and alerts admin)
app.post('/api/request-withdrawal', async (req, res) => {
    const { phoneNumber, amount } = req.body;
    const { data: wallet } = await supabase.from('player_wallets').select('balance').eq('phone_number', phoneNumber).single();

    if (!wallet || wallet.balance < amount) return res.status(400).json({ error: "Insufficient balance." });

    await supabase.from('player_wallets').update({ balance: wallet.balance - amount }).eq('phone_number', phoneNumber);
    await supabase.from('withdrawal_requests').insert([{ phone_number: phoneNumber, amount: amount }]);

    res.json({ message: "Withdrawal request submitted! Admin will send payouts via phone number." });
});

// 5. Admin Payout View Route
app.get('/api/admin/withdrawals', async (req, res) => {
    const { data, error } = await supabase.from('withdrawal_requests').select('*').eq('status', 'Pending');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend Engine running smoothly on port ${PORT}`));
