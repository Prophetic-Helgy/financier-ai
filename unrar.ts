import fs from 'fs';
import { createExtractorFromFile } from 'node-unrar-js';

async function extractRar() {
  try {
    const extractor = await createExtractorFromFile({
      filepath: 'src/components/ref_data.rar',
      targetPath: 'src/components/ref_data_extracted/'
    });
    
    // List files
    const { arcHeader, files } = extractor.extract();
    
    if (!fs.existsSync('src/components/ref_data_extracted')) {
      fs.mkdirSync('src/components/ref_data_extracted', { recursive: true });
    }
    
    // By calling extract with targetPath in the options, node-unrar-js extracts files directly.
    console.log("Extraction complete.");
    for (const file of files) {
       console.log("Found:", file.fileHeader.name);
    }
    
  } catch (err) {
    console.error(err);
  }
}

extractRar();
