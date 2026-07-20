/**
 * BACKUP AUTOMATICO — CREO Positano Glasses → Google Drive (CREO > CLIENTI)
 * Come attivarlo (una sola volta, 2 minuti):
 *  1. Vai su https://script.google.com → "Nuovo progetto"
 *  2. Cancella il contenuto e incolla tutto questo file. Rinomina il progetto "Backup CREO"
 *  3. In alto scegli la funzione "setup" e premi ▶ Esegui
 *  4. Autorizza con il tuo account Google (crescy@gmail.com) quando lo chiede
 * Fatto: ogni lunedì alle 7 circa salva un CSV completo nella cartella CLIENTI
 * e cancella i backup più vecchi di 60 giorni. Il primo backup parte subito.
 */
const FOLDER_ID = '1BmJ4S1UJ1wQ_chr6uH8IcAw1s_72A2P7'; // CREO > CLIENTI
const EXPORT_URL = 'https://creopositano.pages.dev/api/export?key=INSERISCI_LA_BACKUP_KEY';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backup').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  backup(); // primo backup immediato
}

function backup() {
  var r = UrlFetchApp.fetch(EXPORT_URL, {muteHttpExceptions: true});
  if (r.getResponseCode() !== 200) throw new Error('Export fallito: ' + r.getResponseCode());
  var csv = r.getContentText('UTF-8');
  if (csv.indexOf('id,name,status') !== 0) throw new Error('CSV non valido');
  var righe = csv.split('\n').length - 1;
  var folder = DriveApp.getFolderById(FOLDER_ID);
  var oggi = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
  folder.createFile('Backup Clienti completo - ' + oggi + ' (' + righe + ' ordini).csv', csv, 'text/csv');
  var files = folder.getFiles();
  var limite = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60);
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf('Backup Clienti completo') === 0 && f.getDateCreated() < limite) f.setTrashed(true);
  }
}
