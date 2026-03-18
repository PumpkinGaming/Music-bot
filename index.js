process.on('uncaughtException', (err) => {
  console.error('BŁĄD:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('BŁĄD PROMISE:', err);
});
