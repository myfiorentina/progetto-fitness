document.addEventListener('DOMContentLoaded', () => {
  const foodInputElement = document.getElementById('foodInput');
  const submitFoodButton = document.getElementById('submitFood');
  const historyTableBody = document.getElementById('historyTableBody');

  // --- Funzione per caricare e mostrare lo storico ---
  async function caricaStorico() {
    try {
      const response = await fetch('/api/food-history');
      const storico = await response.json();
      
      historyTableBody.innerHTML = ''; // Pulisce la tabella prima di riempirla

      storico.forEach(item => {
        const row = document.createElement('tr');
        const dataPasto = new Date(item.data_pasto).toLocaleString('it-IT');
        
        row.innerHTML = `
          <td>${dataPasto}</td>
          <td>${item.nome_alimento}</td>
          <td>${item.quantita}</td>
          <td>${item.calories.toFixed(0)} kcal</td>
        `;
        historyTableBody.appendChild(row);
      });

    } catch (error) {
      console.error("Errore nel caricamento dello storico:", error);
    }
  }

  // --- Funzione per registrare un nuovo pasto ---
  submitFoodButton.addEventListener('click', async () => {
    const foodText = foodInputElement.value;
    if (!foodText.trim()) return alert('Inserisci cosa hai mangiato.');
    
    try {
      await fetch('/api/process-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: foodText })
      });
      
      foodInputElement.value = '';
      alert('Pasto registrato con successo!');
      caricaStorico(); // Ricarica lo storico per mostrare subito il nuovo pasto

    } catch (error) {
      alert('Si è verificato un errore.');
    }
  });

  // Carica lo storico all'avvio della pagina
  caricaStorico();
});