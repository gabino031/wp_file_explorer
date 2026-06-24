import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonButtons,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonListHeader,
  IonSpinner,
  IonBadge,
  IonSearchbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  documentTextOutline,
  folderOpenOutline,
  settingsOutline,
  homeOutline,
  closeOutline,
  documentOutline,
  reloadOutline,
  searchOutline,
  arrowBackOutline,
  addCircleOutline,
  removeCircleOutline
} from 'ionicons/icons';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import * as mammoth from 'mammoth';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app'; // Aseguramos el ciclo de vida nativo

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
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonFab,
    IonFabButton,
    IonIcon,
    IonButtons,
    IonButton,
    IonList,
    IonItem,
    IonLabel,
    IonListHeader,
    IonSpinner,
    PdfViewerModule,
    IonBadge,
    IonSearchbar
  ],
})
export class HomePage implements OnInit {
  public isViewing: boolean = false;
  public isScanning: boolean = false;
  public pdfSrc: Uint8Array | null = null;
  public wordHtml: string = '';
  public currentFileName: string = '';

  public allDocuments: DocumentItem[] = [];
  public filteredDocuments: DocumentItem[] = [];

  // Control de Zoom
  public zoomLevel: number = 1.0;

  constructor() {
    addIcons({
      documentTextOutline,
      folderOpenOutline,
      settingsOutline,
      homeOutline,
      closeOutline,
      documentOutline,
      reloadOutline,
      searchOutline,
      arrowBackOutline,
      addCircleOutline,
      removeCircleOutline
    });
    (window as any).pdfWorkerSrc = 'assets/pdf.worker.min.mjs';
  }

  async ngOnInit() {
    (window as any).initEasyFileReady = true;
    this.inicializarReceptorDeArchivos();
    await this.scanDevice();
  }

  /* ===========================================================================*/
  /* 🔥 RECEPTOR DE ARCHIVOS DESDE LA MAINACTIVITY (WHATSAPP / EXTERNOS)        */
  /* ===========================================================================*/
  private inicializarReceptorDeArchivos() {
    // Definimos el callback extractor para reutilizarlo de forma segura
    const procesarEvento = (event: any) => {
      const datosArchivo = event.detail;
      if (datosArchivo && datosArchivo.data) {
        console.log('¡Base64 de archivo externo recibido con éxito desde MainActivity!');
        this.cargarBase64EnVisor(datosArchivo.nombre, datosArchivo.data);
      }
    };

    // Escuchar si el evento llega estando la app ya abierta
    window.addEventListener('archivoRecibido', procesarEvento);

    // 💡 SOLUCIÓN AL ARRANQUE EN FRÍO: Si la MainActivity guardó el archivo en una propiedad global 
    // antes de que Angular terminara de cargar, lo leemos directamente aquí.
    if ((window as any).archivoPendiente) {
      console.log('Detectado un archivo pendiente guardado durante el arranque.');
      const pendiente = (window as any).archivoPendiente;
      this.cargarBase64EnVisor(pendiente.nombre, pendiente.data);
      (window as any).archivoPendiente = null; // Limpiamos memoria
    }
  }

  private cargarBase64EnVisor(nombre: string, base64Data: string) {
    this.currentFileName = nombre || 'Archivo_Externo';
    this.zoomLevel = 1.0;
    this.isViewing = true;

    const arrayBuffer = this.base64ToArrayBuffer(base64Data);
    const nameLower = this.currentFileName.toLowerCase();

    // Delay preventivo para asegurar la estabilidad del Canvas de renderizado en el DOM
    setTimeout(() => {
      if (nameLower.endsWith('.pdf')) {
        this.pdfSrc = new Uint8Array(arrayBuffer);
        this.wordHtml = '';
      }
      else if (nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) {
        this.pdfSrc = null;
        mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
          .then(htmlResult => {
            this.wordHtml = htmlResult.value;
          })
          .catch(err => console.error('Error procesando el Word externo:', err));
      }
    }, 200);
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

      // 📁 1. LEER CARPETA "Download"
      try {
        const resDownload = await Filesystem.readdir({
          path: 'Download',
          directory: Directory.ExternalStorage
        });
        const files = resDownload.files.map(f => ({ ...f, origin: 'Descargas' }));
        archivosCrudos = [...archivosCrudos, ...files];
      } catch (err) {
        console.warn('No se pudo leer Download:', err);
      }

      // 📁 2. LEER CARPETA "Documents"
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

      // 🔍 5. FILTRAR Y MAPEAR
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
            origin: file.origin
          };
        });

      // Eliminar duplicados por nombre
      this.allDocuments = this.allDocuments.filter((value, index, self) =>
        index === self.findIndex((t) => t.name === value.name)
      );

      this.filteredDocuments = [...this.allDocuments];
      console.log('Archivos indexados con éxito:', this.allDocuments);

    } catch (error) {
      console.error('Error general en el escaneo:', error);
    } finally {
      this.isScanning = false;
    }
  }

  /* ===========================================================================*/
  /* VISUALIZADOR INTERNO AL DAR CLIC EN LA LISTA LOCAL                         */
  /* ===========================================================================*/
  async renderDocument(doc: DocumentItem) {
    try {
      this.currentFileName = doc.name;
      this.zoomLevel = 1.0;
      this.isViewing = true;

      const result = await Filesystem.readFile({
        path: doc.uri
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
      console.error('Error al abrir el documento local:', error);
      this.isViewing = false;
    }
  }

  /* ===========================================================================*/
  /* ACCIÓN DEL BOTÓN FLOTANTE (SELECTOR MANUAL)                                */
  /* ===========================================================================*/
  async seleccionarArchivo() {
    try {
      console.log('Abriendo el explorador de archivos nativo del celular...');
    } catch (error) {
      console.error('Error en el selector manual:', error);
    }
  }

  /* ===========================================================================*/
  /* CONTROLES DE ZOOM (+ / -) Y CIERRE                                         */
  /* ===========================================================================*/
  zoomIn() {
    if (this.zoomLevel < 3.0) this.zoomLevel += 0.2;
  }

  zoomOut() {
    if (this.zoomLevel > 0.4) this.zoomLevel -= 0.2;
  }

  closeDocument() {
    this.isViewing = false;
    this.pdfSrc = null;
    this.wordHtml = '';
    this.currentFileName = '';
    this.zoomLevel = 1.0;
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

  /* ===========================================================================*/
  /* FILTRADO EN TIEM REAL DESDE EL INPUT SUPERIOR                             */
  /* ===========================================================================*/
  filtrarDocumentos(event: any) {
    const textoBusqueda = event.target.value ? event.target.value.toLowerCase().trim() : '';

    if (!textoBusqueda) {
      this.filteredDocuments = [...this.allDocuments];
      return;
    }
    this.filteredDocuments = this.allDocuments.filter(doc => {
      return doc.name.toLowerCase().includes(textoBusqueda);
    });
  }
}