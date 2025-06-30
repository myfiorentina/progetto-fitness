require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
console.log("Configurazione per database PostgreSQL pronta.");

app.use(express.json());
app.use(express.static('public'));

async function analizzaPastoConGemini(testoPasto) {
    const prompt = `Dato il seguente testo che descrive un pasto in italiano... (il resto del prompt rimane uguale)`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const match = response.text().match(/{[\s\S]*}/);
        if (match) return JSON.parse(match[0]);
        throw new Error("Nessun JSON valido trovato nella risposta di Gemini.");
    } catch (error) {
        console.error("Errore durante l'analisi della risposta di Gemini:", error);
        return { error: "Impossibile analizzare il testo del pasto." };
    }
}

async function salvaPastoNelDB(alimento) {
    const sql = `INSERT INTO log_alimentare (nome_alimento, quantita, calories, protein_g, fat_total_g, carbohydrates_total_g) VALUES ($1, $2, $3, $4, $5, $6)`;
    const values = [alimento.nome, alimento.quantita, alimento.nutrizione.calories || 0, alimento.nutrizione.protein_g || 0, alimento.nutrizione.fat_total_g || 0, alimento.nutrizione.carbohydrates_total_g || 0];
    try {
        const { rowCount } = await dbPool.query(sql, values);
        console.log(`- Salvato nel DB: ${alimento.nome}. Righe modificate: ${rowCount}`);
        return { success: true };
    } catch (dbError) {
        console.error("!!! ERRORE DURANTE IL SALVATAGGIO:", dbError.message);
        return { success: false, error: dbError.message };
    }
}

app.post('/api/process-food', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Nessun testo fornito.' });
    
    console.log('1. Ricevuto testo:', text);
    const analisiCompleta = await analizzaPastoConGemini(text);

    if (analisiCompleta.error || !analisiCompleta.alimenti) return res.status(500).json(analisiCompleta);
    
    let calorieTotali = 0;
    let dbErrors = [];
    for (const alimento of analisiCompleta.alimenti) {
        if (alimento.nutrizione && typeof alimento.nutrizione.calories === 'number') {
            calorieTotali += alimento.nutrizione.calories;
            const dbResult = await salvaPastoNelDB(alimento); 
            if (!dbResult.success) dbErrors.push(dbResult.error);
        }
    }

    if (dbErrors.length > 0) {
        return res.status(500).json({ error: 'Errore durante il salvataggio nel database.', details: dbErrors });
    }

    res.json({ message: 'Pasto salvato con successo', calorieTotali: calorieTotali.toFixed(2) });
});

app.get('/api/food-history', async (req, res) => {
  try {
    const { rows } = await dbPool.query('SELECT * FROM log_alimentare ORDER BY data_pasto DESC LIMIT 50');
    console.log(`Recuperate ${rows.length} righe dallo storico.`);
    res.json(rows);
  } catch (dbError) {
    console.error("!!! ERRORE RECUPERO STORICO:", dbError.message);
    res.status(500).json({ error: 'Impossibile recuperare lo storico dal database.', details: dbError.message });
  }
});

app.listen(port, () => {
    console.log(`Server avviato sulla porta ${port}.`);
});