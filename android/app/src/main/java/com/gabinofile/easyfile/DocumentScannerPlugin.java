package com.gabinofile.easyfile;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "DocumentScanner")
public class DocumentScannerPlugin extends Plugin {

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
                intent.setData(uri);
                getActivity().startActivity(intent);
                call.resolve(new JSObject().put("granted", false));
                return;
            }
        }
        call.resolve(new JSObject().put("granted", true));
    }

    @PluginMethod
    public void scanDocuments(PluginCall call) {
        JSArray docs = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();

        Uri collection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL);
        } else {
            collection = MediaStore.Files.getContentUri("external");
        }

        String[] projection = new String[] {
                MediaStore.Files.FileColumns._ID,
                MediaStore.Files.FileColumns.DISPLAY_NAME,
                MediaStore.Files.FileColumns.MIME_TYPE,
                MediaStore.Files.FileColumns.DATE_ADDED,
                MediaStore.Files.FileColumns.DATA
        };

        String selection = MediaStore.Files.FileColumns.MIME_TYPE + "=? OR " 
                         + MediaStore.Files.FileColumns.MIME_TYPE + "=? OR " 
                         + MediaStore.Files.FileColumns.MIME_TYPE + "=?";
                         
        String[] selectionArgs = new String[] {
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        };

        String sortOrder = MediaStore.Files.FileColumns.DATE_ADDED + " DESC";

        try (Cursor cursor = resolver.query(
                collection,
                projection,
                selection,
                selectionArgs,
                sortOrder
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE);
                int dateColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED);
                int dataColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    String name = cursor.getString(nameColumn);
                    String mimeType = cursor.getString(mimeColumn);
                    long dateAdded = cursor.getLong(dateColumn);
                    String path = cursor.getString(dataColumn);

                    Uri contentUri = Uri.withAppendedPath(collection, String.valueOf(id));

                    JSObject doc = new JSObject();
                    doc.put("id", id);
                    doc.put("name", name != null ? name : "Unknown");
                    doc.put("mimeType", mimeType);
                    doc.put("date", dateAdded * 1000); // convert to milliseconds
                    doc.put("uri", contentUri.toString());
                    doc.put("path", path);

                    docs.put(doc);
                }
            }
        } catch (Exception e) {
            call.reject("Error scanning documents", e);
            return;
        }

        JSObject result = new JSObject();
        result.put("documents", docs);
        call.resolve(result);
    }

    @PluginMethod
    public void readDocumentBase64(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("Must provide an uri");
            return;
        }

        Uri uri = Uri.parse(uriString);
        try (InputStream is = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
             
            if (is == null) {
                call.reject("Could not open input stream for uri: " + uriString);
                return;
            }
            
            int nRead;
            byte[] data = new byte[16384];
            while ((nRead = is.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }

            byte[] bytes = buffer.toByteArray();
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            
            JSObject ret = new JSObject();
            ret.put("data", base64);
            call.resolve(ret);

        } catch (Exception e) {
            call.reject("Error reading document", e);
        }
    }
}
