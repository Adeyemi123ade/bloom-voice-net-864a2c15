package com.bloomvoicenet.chat;

import android.os.Bundle;
import java.util.Map;

public class Extras {
    static Bundle from(Map<String, String> data) {
        Bundle b = new Bundle();
        for (Map.Entry<String, String> e : data.entrySet()) b.putString(e.getKey(), e.getValue());
        return b;
    }
}
