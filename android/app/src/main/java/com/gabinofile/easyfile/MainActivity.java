package com.gabinofile.easyfile;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Manejar el archivo si la app se abrió estando cerrada
        manejarIntentConArchivo(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        
        // Manejar el archivo si la app ya estaba abierta en segundo plano
        manejarIntentConArchivo(intent);
    }

    private void manejarIntentConArchivo(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        String type = intent.getType();

        // Verificamos si la acción es para ver o recibir un archivo
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_SEND.equals(action)) {
            Uri archivoUri = null;

            if (Intent.ACTION_VIEW.equals(action)) {
                archivoUri = intent.getData();
            } else if (Intent.ACTION_SEND.equals(action)) {
                archivoUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }

            if (archivoUri != null) {
                // Convertimos la ruta nativa a un formato que Capacitor entienda en la Webview
                String rutaFinal = archivoUri.toString();
                
                // Enviamos un evento global a Angular con la URI del archivo
                this.getBridge().triggerJSEvent("archivoRecibido", "window", "{ \"url\": \"" + rutaFinal + "\" }");
            }
        }
    }
}