require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// --- Configurazione Servizi e DB ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
console.log("Configurazione per database PostgreSQL pronta.");
// ------------------------------

app.use(express.json());
app.use(express.static('public'));

// --- Funzioni di Logica ---
async function analizzaPastoConGemini(testoPasto) {
    const prompt = `Dato il seguente testo... (Il resto del prompt rimane uguale)`;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const match = response.text().match(/{[\s\S]*}/);
        if (match) return JSON.parse(match[0]);
        throw new Error("Nessun JSON valido trovato nella risposta di Gemini.");
    } catch (error) {
        return { error: "Impossibile analizzare il testo del pasto." };
    }
}

async function salvaPastoNelDB(alimento) {
    const sql = `INSERT INTO log_alimentare (nome_alimento, quantita, calories, protein_g, fat_total_g, carbohydrates_total_g) VALUES ($1, $2, $3, $4, $5, $6)`;
    const values = [alimento.nome, alimento.quantita, alimento.nutrizione.calories || 0, alimento.nutrizione.protein_g || 0, alimento.nutrizione.fat_total_g || 0, alimento.nutrizione.carbohydrates_total_g || 0];
    try {
        await dbPool.query(sql, values);
        console.log(`- Salvato nel DB: ${alimento.nome}`);
    } catch (dbError) {
        console.error("Errore durante il salvataggio nel DB:", dbError);
    }
}

// =================================================================
// === NUOVA ROTTA SPECIALE PER IL SETUP DEL DATABASE ===
app.get('/api/setup-database', async (req, res) => {
  const createTablesSql = `
    CREATE TABLE IF NOT EXISTS log_alimentare (
      id SERIAL PRIMARY KEY,
      data_pasto TIMESTAMP NOT NULL DEFAULT NOW(),
      nome_alimento VARCHAR(255) NOT NULL,
      quantita VARCHAR(100) NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL NOT NULL,
      fat_total_g REAL NOT NULL,
      carbohydrates_total_g REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pesate (
      id SERIAL PRIMARY KEY,
      data_pesata TIMESTAMP NOT NULL DEFAULT NOW(),
      peso_kg REAL NOT NULL,
      body_fat_percentage REAL,
      total_body_water_percentage REAL,
      muscle_mass_percentage REAL
    );
  `;
  try {
    await dbPool.query(createTablesSql);
    res.status(200).send('<h1>Tabelle create con successo!</h1><p>Ora puoi tornare alla pagina principale. Per sicurezza, rimuovi questo endpoint dal codice sorgente.</p>');
  } catch (error) {
    console.error("Errore durante la creazione delle tabelle:", error);
    res.status(500).send('<h1>Errore durante la creazione delle tabelle.</h1><p>Controlla i log del server.</p>');
  }
});
// =================================================================


// --- Rotte API Principali ---
app.post('/api/process-food', async (req, res) => {
    // ... (il resto della rotta rimane identico a prima)
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Nessun testo fornito.' });
    const analisiCompleta = await analizzaPastoConGemini(text);
    if (analisiCompleta.error || !analisiCompleta.alimenti) return res.status(500).json(analisiCompleta);
    let calorieTotali = 0;
    for (const alimento of analisiCompleta.alimenti) {
        if (alimento.nutrizione && typeof alimento.nutrizione.calories === 'number') {
            calorieTotali += alimento.nutrizione.calories;
            await salvaPastoNelDB(alimento); 
        }
    }
    res.json({ calorieTotali: calorieTotali.toFixed(2) });
});

app.get('/api/food-history', async (req, res) => {
    // ... (questa rotta rimane identica a prima)
    try {
        const { rows } = await dbPool.query('SELECT * FROM log_alimentare ORDER BY data_pasto DESC LIMIT 50');
        res.json(rows);
    } catch (dbError) {
        res.status(500).json({ error: 'Impossibile recuperare lo storico.' });
    }
});

app.listen(port, () => {
    console.log(`Server avviato sulla porta ${port}.`);
});