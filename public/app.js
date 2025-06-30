document.addEventListener('DOMContentLoaded', () => {
  const foodInputElement = document.getElementById('foodInput');
  const submitFoodButton = document.getElementById('submitFood');
  const historyTableBody = document.getElementById('historyTableBody');

  async function caricaStorico() {
    console.log("-> Sto caricando lo storico...");
    historyTableBody.innerHTML = '<tr><td colspan="4">Caricamento...</td></tr>';
    try {
      const response = await fetch('/api/food-history');
      console.log("<- Risposta dal server per lo storico:", response);

      if (!response.ok) {
        throw new Error(`Errore dal server: ${response.status}`);
      }

      const storico = await response.json();
      console.log("<- Dati dello storico ricevuti (JSON):", storico);
      
      historyTableBody.innerHTML = ''; // Pulisce la tabella
      
      if (storico.length === 0) {
        historyTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nessun pasto registrato.</td></tr>';
      } else {
        storico.forEach(item => {
          const row = document.createElement('tr');
          // Formattiamo la data in un formato leggibile per l'Italia
          const dataPasto = new Date(item.data_pasto).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          row.innerHTML = `
            <td>${dataPasto}</td>
            <td>${item.nome_alimento}</td>
            <td>${item.quantita}</td>
            <td>${parseFloat(item.calories).toFixed(0)} kcal</td>
          `;
          historyTableBody.appendChild(row);
        });
      }
    } catch (error) {
      console.error("!!! ERRORE CRITICO nel caricamento dello storico:", error);
      historyTableBody.innerHTML = '<tr><td colspan="4" style="color: red; text-align: center;">Impossibile caricare lo storico.</td></tr>';
    }
  }

  submitFoodButton.addEventListener('click', async () => {
    const foodText = foodInputElement.value;
    if (!foodText.trim()) return alert('Inserisci cosa hai mangiato.');
    
    console.log("-> Invio del pasto al server...");
    try {
      const response = await fetch('/api/process-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: foodText })
      });
      
      const result = await response.json();
      console.log("<- Risposta del server dopo il salvataggio:", result);

      if (response.ok) {
        alert('Pasto registrato con successo!');
        foodInputElement.value = '';
        caricaStorico(); // Ricarica lo storico per mostrare subito il nuovo pasto
      } else {
        throw new Error(result.error || 'Errore sconosciuto');
      }
    } catch (error) {
      console.error("!!! ERRORE CRITICO durante la registrazione del pasto:", error);
      alert(`Si è verificato un errore: ${error.message}`);
    }
  });

  caricaStorico();
});