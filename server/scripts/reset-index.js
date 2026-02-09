import 'dotenv/config';


const ES_URL = process.env.ES_URL;
const ES_API_KEY = process.env.ES_API_KEY;
const INDEX_NAME = 'how-it-lands';

if (!ES_URL || !ES_API_KEY) {
    console.error('Missing ES_URL or ES_API_KEY');
    process.exit(1);
}

async function resetIndex() {
    console.log(`[Reset] Deleting index '${INDEX_NAME}'...`);

    // Delete index
    const response = await fetch(`${ES_URL}/${INDEX_NAME}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `ApiKey ${ES_API_KEY}`
        }
    });

    if (response.ok || response.status === 404) {
        console.log(`[Reset] Index '${INDEX_NAME}' deleted successfully (or didn't exist).`);
        console.log('[Reset] Restart the server to recreate it with correct mapping.');
    } else {
        const text = await response.text();
        console.error(`[Reset] Failed to delete index: ${response.status} ${text}`);
    }
}

resetIndex();
