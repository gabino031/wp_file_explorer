import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonFooter, IonButtons, IonButton, IonList, IonItem, IonLabel, IonListHeader, IonSpinner, IonBadge } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { documentTextOutline, folderOpenOutline, settingsOutline, homeOutline, closeOutline, documentOutline, reloadOutline } from 'ionicons/icons';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import * as mammoth from 'mammoth';
import { Filesystem, Directory } from '@capacitor/filesystem';

interface DocumentItem {
  id: number;
  name: string;
  mimeType: string;
  date: number;
  uri: string;
  path: string;
  origin?: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonFooter, IonButtons, IonButton, IonList, IonItem, IonLabel, IonListHeader, IonSpinner, PdfViewerModule, IonBadge],
})
export class HomePage implements OnInit {
  public isViewing: boolean = false;
  public isScanning: boolean = false;
  public pdfSrc: Uint8Array | null = null;
  public wordHtml: string = '';
  public currentFileName: string = '';
  public allDocuments: DocumentItem[] = [];

  constructor() {
    addIcons({ documentTextOutline, folderOpenOutline, settingsOutline, homeOutline, closeOutline, documentOutline, reloadOutline });
    (window as any).pdfWorkerSrc = 'assets/pdf.worker.min.mjs';
  }

  async ngOnInit() {
    await this.scanDevice(); // Tu escaneo normal de carpetas

    // 🔥 ESCUCHAR SI OTRA APP NOS MANDÓ UN ARCHIVO
    window.addEventListener('archivoRecibido', async (event: any) => {
      const datosArchivo = event.detail;
      if (datosArchivo && datosArchivo.url) {
        console.log('Archivo recibido desde otra app:', datosArchivo.url);

        // Creamos un objeto temporal idéntico a tu interfaz DocumentItem
        const documentoExterno = {
          id: 999,
          name: datosArchivo.url.substring(datosArchivo.url.lastIndexOf('/') + 1) || 'Documento_Externo',
          mimeType: datosArchivo.url.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          date: Date.now(),
          uri: datosArchivo.url,
          path: datosArchivo.url
        };

        // Forzamos a tu visor actual a renderizar el archivo que nos pasaron
        await this.renderDocument(documentoExterno);
      }
    });
  }

  /* ===========================================================================*/
  /* ESCANEO DIRECTO DE LAS CARPETAS PÚBLICAS DEL CELULAR                       */
  /* ===========================================================================*/


  async scanDevice() {
    try {
      this.isScanning = true;
      this.allDocuments = [];
      let idCounter = 1;
      let archivosCrudos: any[] = [];

      // 📁 1. LEER LA CARPETA "Download"
      try {
        const resDownload = await Filesystem.readdir({
          path: 'Download',
          directory: Directory.ExternalStorage
        });
        // Le añadimos la propiedad origin en caliente a cada archivo de esta carpeta
        const files = resDownload.files.map(f => ({ ...f, origin: 'Descargas' }));
        archivosCrudos = [...archivosCrudos, ...files];
      } catch (err) {
        console.warn('No se pudo leer Download:', err);
      }

      // 📁 2. LEER LA CARPETA "Documents"
      try {
        const resDocs = await Filesystem.readdir({
          path: 'Documents',
          directory: Directory.ExternalStorage
        });
        const files = resDocs.files.map(f => ({ ...f, origin: 'Documentos' }));
        archivosCrudos = [...archivosCrudos, ...files];
      } catch (err) {
        console.warn('No se pudo leer Documents:', err);
      }

      // 📁 3. ENTRAR DIRECTO A LOS DOCUMENTOS DE WHATSAPP
      try {
        const resWhatsApp = await Filesystem.readdir({
          path: 'Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents',
          directory: Directory.ExternalStorage
        });
        const files = resWhatsApp.files.map(f => ({ ...f, origin: 'WhatsApp' }));
        archivosCrudos = [...archivosCrudos, ...files];
      } catch (err) {
        console.warn('No se encontraron archivos en WhatsApp.');
      }

      // 📁 4. ENTRAR DIRECTO A WHATSAPP BUSINESS
      try {
        const resWhatsAppBiz = await Filesystem.readdir({
          path: 'Android/media/com.whatsapp.w4b/WhatsApp Business/Media/WhatsApp Documents',
          directory: Directory.ExternalStorage
        });
        const files = resWhatsAppBiz.files.map(f => ({ ...f, origin: 'WhatsApp Business' }));
        archivosCrudos = [...archivosCrudos, ...files];
      } catch (err) {
        console.warn('No se encontraron archivos en WhatsApp Business.');
      }

      // 🔍 5. FILTRAR Y MAPEAR CON EL ORIGEN INCLUIDO
      this.allDocuments = archivosCrudos
        .filter(file => {
          if (file.type === 'directory') return false;
          const nameLower = file.name.toLowerCase();
          return nameLower.endsWith('.pdf') || nameLower.endsWith('.docx') || nameLower.endsWith('.doc');
        })
        .map(file => {
          return {
            id: idCounter++,
            name: file.name,
            mimeType: file.name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            date: file.mtime || Date.now(),
            uri: file.uri,
            path: file.uri,
            origin: file.origin // 🔥 Pasamos el origen al objeto final de la lista
          };
        });

      // Eliminar duplicados por nombre
      this.allDocuments = this.allDocuments.filter((value, index, self) =>
        index === self.findIndex((t) => t.name === value.name)
      );

      console.log('Archivos indexados con origen:', this.allDocuments);

    } catch (error) {
      console.error('Error general en el escaneo:', error);
    } finally {
      this.isScanning = false;
    }
  }

  /* ===========================================================================*/
  /* VISUALIZADOR INTERNO AL DAR CLIC                                           */
  /* ===========================================================================*/
  async renderDocument(doc: DocumentItem) {
    try {
      this.currentFileName = doc.name;
      this.isViewing = true;

      // 🔥 LEEMOS DIRECTAMENTE EL ARCHIVO MEDIANTE SU URI ABSOLUTA
      const result = await Filesystem.readFile({
        path: doc.uri // Capacitor lee la ruta nativa "file:///storage..." directamente
      });

      const arrayBuffer = this.base64ToArrayBuffer(result.data as string);
      const nameLower = doc.name.toLowerCase();

      if (nameLower.endsWith('.pdf')) {
        this.pdfSrc = new Uint8Array(arrayBuffer);
        this.wordHtml = '';
      }
      else if (nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) {
        this.pdfSrc = null;
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        this.wordHtml = htmlResult.value;
      }
    } catch (error) {
      console.error('Error al abrir el documento de la carpeta pública:', error);
      this.isViewing = false;
    }
  }

  closeDocument() {
    this.isViewing = false;
    this.pdfSrc = null;
    this.wordHtml = '';
    this.currentFileName = '';
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}