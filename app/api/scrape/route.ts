import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const chatUrl = url.searchParams.get('chatUrl');

    if (!chatUrl) {
      return NextResponse.json(
        { error: 'Chat URL is required.' },
        { status: 400 }
      );
    }

    // Launch Puppeteer browser instance
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Useful for environments like Docker
    });

    const page = await browser.newPage();

    // Navigate to the chat URL
    await page.goto(chatUrl, { waitUntil: 'networkidle2' });

    // Wait for the chat messages to load
    const chatSelector = 'div[class*="conversation-turn"]';
    await page.waitForSelector(chatSelector, { timeout: 60000 });

    // Extract user and ChatGPT messages
    const messages = await page.evaluate(() => {
      // Select messages based on data-role attributes for user and ChatGPT
      const userMessages = Array.from(document.querySelectorAll('[data-message-author-role="user"]'))
        .map((el) => (el as HTMLElement).innerText.trim());

      const chatGptMessages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'))
        .map((el) => (el as HTMLElement).innerText.trim());

      return { userMessages, chatGptMessages };
    });

    if (!messages) {
      await browser.close();
      return NextResponse.json(
        { error: 'Failed to extract chat messages.' },
        { status: 400 }
      );
    }

    // Prepare the content for the PDF: alternating user and ChatGPT messages
    let pdfContent = '';

    messages.userMessages.forEach((userMessage, index) => {
      const chatGptMessage = messages.chatGptMessages[index];

      // Add user question with numbering
      pdfContent += `<div class="user-message"><strong>Q${index + 1}:</strong> ${userMessage}</div>`;

      // Add ChatGPT response
      if (chatGptMessage) {
        pdfContent += `<div class="chatgpt-message"><strong>ChatGPT:</strong> ${chatGptMessage}</div>`;
      }
    });

    // Set the content for the PDF
    await page.setContent(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              line-height: 1.5;
            }
            .user-message {
              color: blue;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .chatgpt-message {
              color: green;
              font-style: italic;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          ${pdfContent}
        </body>
      </html>
    `);

    // Define the file path for saving the PDF
    const pdfFilePath = path.join(process.cwd(), '/public/chat-message.pdf');

    // Generate and save the PDF in the working directory
    await page.pdf({
      path: pdfFilePath,
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', left: '1cm', right: '1cm', bottom: '1cm' },
    });

    console.log('PDF saved to:', pdfFilePath); // Log the location of the saved PDF

    await browser.close(); // Close the browser after the PDF is saved

    return NextResponse.json({ message: 'PDF generated successfully!' }, { status: 200 });
  } catch (error) {
    console.error('Error processing chat URL:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing the chat URL.' },
      { status: 500 }
    );
  }
}
