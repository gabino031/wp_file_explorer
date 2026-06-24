package com.gabinofile.easyfile;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    
    // Guardamos temporalmente el payload si el puente web aún no está listo
    private String payloadPendiente = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 💡 Esperamos a que el puente esté listo para disparar el evento si venía de un arranque en frío
        this.bridge.getWebView().post(new Runnable() {
            @Override
            public void run() {
                manejarIntentConArchivo(getIntent());
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        verificarPermisoAlmacenamiento();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        manejarIntentConArchivo(intent);
    }

    private void verificarPermisoAlmacenamiento() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                Uri uri = Uri.fromParts("package", getPackageName(), null);
                intent.setData(uri);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        }
    }

    private void manejarIntentConArchivo(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_SEND.equals(action)) {
            Uri archivoUri = null;

            if (Intent.ACTION_VIEW.equals(action)) {
                archivoUri = intent.getData();
            } else if (Intent.ACTION_SEND.equals(action)) {
                archivoUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }

            if (archivoUri != null) {
                try {
                    // 1. Obtener el nombre real del archivo desde el proveedor de contenido (ej: WhatsApp)
                    String nombreArchivo = obtenerNombreReal(archivoUri);
                    if (nombreArchivo == null) {
                        nombreArchivo = "documento_externo.pdf";
                        if (intent.getType() != null && (intent.getType().contains("word") || intent.getType().contains("msword"))) {
                            nombreArchivo = "documento_externo.docx";
                        }
                    }

                    // 2. Leer el archivo y pasarlo a bytes
                    InputStream inputStream = getContentResolver().openInputStream(archivoUri);
                    ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
                    byte[] buffer = new byte[1024];
                    int len;
                    while ((len = inputStream.read(buffer)) != -1) {
                        byteBuffer.write(buffer, 0, len);
                    }
                    byte[] archivoBytes = byteBuffer.toByteArray();
                    String base64Resultado = Base64.encodeToString(archivoBytes, Base64.NO_WRAP);

                    // 3. Crear el JSON string escapando correctamente comillas
                    String jsonPayload = "{ \"nombre\": \"" + nombreArchivo + "\", \"data\": \"" + base64Resultado + "\" }";

                    // 4. Inyección segura usando javascript preventivo para sincronizar con Angular
                    // Si el componente de Angular aún no se registra, lo guarda en 'window.archivoPendiente'
                    final String jsScript = "if (window.initEasyFileReady || window.listeners?.archivoRecibido) { " +
                            "  window.dispatchEvent(new CustomEvent('archivoRecibido', { detail: " + jsonPayload + " })); " +
                            "} else { " +
                            "  window.archivoPendiente = " + jsonPayload + "; " +
                            "}";

                    // Forzamos la ejecución en el hilo visual del WebView
                    this.bridge.getWebView().post(new Runnable() {
                        @Override
                        public void run() {
                            bridge.getWebView().evaluateJavascript(jsScript, null);
                            Log.d("EasyFile", "Payload inyectado al WebView con éxito.");
                        }
                    });

                } catch (Exception e) {
                    Log.e("EasyFile", "Error procesando URI externa: " + e.getMessage());
                }
            }
        }
    }

    // 🔥 FUNCIÓN EXTRA: Obtiene el nombre real del archivo (ej: "Contrato_Final.pdf") desde la Uri de WhatsApp
    private String obtenerNombreReal(Uri uri) {
        String resultado = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (index != -1) {
                        resultado = cursor.getString(index);
                    }
                }
            } catch (Exception e) {
                Log.w("EasyFile", "No se pudo consultar el nombre real del archivo: " + e.getMessage());
            }
        }
        if (resultado == null) {
            resultado = uri.getPath();
            int cut = resultado.lastIndexOf('/');
            if (cut != -1) {
                resultado = resultado.substring(cut + 1);
            }
        }
        return resultado;
    }
}