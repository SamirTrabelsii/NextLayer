const url = 'https://zymzdqazfloggtdwhuph.supabase.co/rest/v1/productions?limit=1';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5bXpkcWF6ZmxvZ2d0ZHdodXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODk2NzEsImV4cCI6MjA5MzU2NTY3MX0.t8AIoY5TPS_Px5VMOitEpGNFdKAKN3XQpE55oAg_CSE';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
}).then(res => res.json()).then(data => {
  if (data.length > 0) {
    console.log("Productions columns:", Object.keys(data[0]));
  } else {
    console.log("No data returned, response:", data);
  }
}).catch(console.error);
