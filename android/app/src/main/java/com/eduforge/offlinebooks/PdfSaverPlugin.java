package com.eduforge.offlinebooks;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "PdfSaver")
public class PdfSaverPlugin extends Plugin {
    @PluginMethod
    public void savePdf(PluginCall call) {
        String assetPath = call.getString("assetPath", "");
        String filename = call.getString("filename", "worksheet.pdf");
        String cleanPath = assetPath.replaceFirst("^/+", "").split("[?#]", 2)[0];

        if (!cleanPath.startsWith("assets/") || cleanPath.contains("..")) {
            call.reject("Invalid PDF asset path.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "savePdfResult");
    }

    @ActivityCallback
    private void savePdfResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }

        Uri destination = result.getData().getData();
        String assetPath = call.getString("assetPath", "");
        String cleanPath = assetPath.replaceFirst("^/+", "").split("[?#]", 2)[0];

        try (
            InputStream input = getContext().getAssets().open("public/" + cleanPath);
            OutputStream output = getContext().getContentResolver().openOutputStream(destination)
        ) {
            if (output == null) throw new IllegalStateException("Could not open the selected document.");
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.flush();
            JSObject response = new JSObject();
            response.put("saved", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not save the PDF.", error);
        }
    }
}
