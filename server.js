// Carica le variabili d'ambiente (per lo sviluppo locale)
require('dotenv').config(); 

const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pool } = require('pg'); // Importiamo il driver per PostgreSQL

const app = express();
// Render imposta la porta automaticamente tramite la variabile PORT
const port = process.env.PORT || 3000; 

// --- Configurazione Servizi e DB ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Creiamo un "pool" di connessioni al database PostgreSQL
// Render fornirà l'URL di connessione tramite questa variabile d'ambiente
const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // La seguente configurazione SSL è spesso necessaria per le connessioni su Render
    ssl: {
        rejectUnauthorized: false
    }
});
console.log("Configurazione per database PostgreSQL pronta.");
// ------------------------------

app.use(express.json());
app.use(express.static('public'));

// --- Funzioni di Logica ---
async function analizzaPastoConGemini(testoPasto) {
  // Il prompt "tutto incluso" che abbiamo definito
  const prompt = `Dato il seguente testo che descrive un pasto in italiano, esegui questi passaggi:
1. Estrai ogni alimento e la sua quantità.
2. Per ogni alimento, fornisci una stima dei seguenti valori nutrizionali: calorie (calories), proteine in grammi (protein_g), grassi totali in grammi (fat_total_g) e carboidrati totali in grammi (carbohydrates_total_g).
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido. L'oggetto deve avere una chiave 'alimenti' che contiene un array di oggetti. Ogni oggetto deve avere le chiavi 'nome' (in italiano), 'quantita', e una chiave 'nutrizione' contenente un oggetto con i valori stimati.
Esempio: per 'un piatto di pasta al pesto', rispondi con {"alimenti": [{"nome": "pasta al pesto", "quantita": "180g", "nutrizione": {"calories": 550, "protein_g": 15, "fat_total_g": 30, "carbohydrates_total_g": 55}}]}.
Non aggiungere testo o spiegazioni prima o dopo il JSON.
Testo: "${testoPasto}"`;
  
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

// Funzione per salvare i dati nel database PostgreSQL
async function salvaPastoNelDB(alimento) {
  const { nome, quantita, nutrizione } = alimento;
  // La sintassi per i placeholder in pg è $1, $2, etc.
  const sql = `INSERT INTO log_alimentare (nome_alimento, quantita, calories, protein_g, fat_total_g, carbohydrates_total_g) VALUES ($1, $2, $3, $4, $5, $6)`;
  const values = [
    nome,
    quantita,
    nutrizione.calories || 0,
    nutrizione.protein_g || 0,
    nutrizione.fat_total_g || 0,
    nutrizione.carbohydrates_total_g || 0
  ];
  try {
    await dbPool.query(sql, values);
    console.log(`- Salvato nel DB: ${nome}`);
  } catch (dbError) {
    console.error("Errore durante il salvataggio nel DB:", dbError);
  }
}

// --- Rotte API ---
app.post('/api/process-food', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Nessun testo fornito.' });
    
    console.log('1. Ricevuto testo:', text);
    const analisiCompleta = await analizzaPastoConGemini(text);

    if (analisiCompleta.error || !analisiCompleta.alimenti) return res.status(500).json(analisiCompleta);

    console.log('2. Risultato da Gemini:', analisiCompleta);
    
    let calorieTotali = 0;
    for (const alimento of analisiCompleta.alimenti) {
        if (alimento.nutrizione && typeof alimento.nutrizione.calories === 'number') {
            calorieTotali += alimento.nutrizione.calories;
            // Chiamiamo la funzione per salvare ogni alimento nel DB
            await salvaPastoNelDB(alimento); 
        }
    }
    console.log(`--- CALORIE TOTALI (stimate): ${calorieTotali.toFixed(2)} kcal ---`);
    res.json({ calorieTotali: calorieTotali.toFixed(2) });
});

// Rotta per recuperare lo storico dei pasti
app.get('/api/food-history', async (req, res) => {
  try {
    // La sintassi della query è la stessa, ma il modo di ottenere il risultato cambia leggermente
    const { rows } = await dbPool.query('SELECT * FROM log_alimentare ORDER BY data_pasto DESC LIMIT 50');
    res.json(rows);
  } catch (dbError) {
    console.error("Errore recupero storico:", dbError);
    res.status(500).json({ error: 'Impossibile recuperare lo storico.' });
  }
});

// --- Avvio del Server ---
app.listen(port, () => {
    console.log(`Server avviato sulla porta ${port}.`);
});