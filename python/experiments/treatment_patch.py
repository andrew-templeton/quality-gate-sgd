# =============================================================================
# WIP - NOT WORKING IMPLEMENTATION
# This is experimental code under active development. Do not use in production.
# =============================================================================
"""
Convert the quality-gated agent's patch to proper unified diff format
and create a predictions file for SWE-bench evaluation.
"""

import json

# The patch from our quality-gated agent (Kahn's topological sort)
TREATMENT_PATCH = '''diff --git a/django/forms/widgets.py b/django/forms/widgets.py
index 02aa32b207..e8b5f3a123 100644
--- a/django/forms/widgets.py
+++ b/django/forms/widgets.py
@@ -117,36 +117,53 @@ class Media:

     @staticmethod
     def merge(list_1, list_2):
-        """
-        Merge two lists while trying to keep the relative order of the elements.
-        Warn if the lists have the same two elements in a different relative
-        order.
+        """Merge two lists, preserving the relative order expressed by each list.

-        For static assets it can be important to have them included in the DOM
-        in a certain order. In JavaScript you may not be able to reference a
-        global or in CSS you might want to override a style.
+        Each input list defines a partial order (each element before its successor).
+        We attempt to produce a total order that satisfies both partial orders by
+        topologically sorting the precedence graph defined by adjacent pairs in
+        the input lists. A MediaOrderConflictWarning is only emitted when the
+        combined precedence constraints contain a cycle (i.e. no valid order
+        exists). In that case we fall back to a deterministic union order based
+        on first appearance.
         """
-        # Start with a copy of list_1.
-        combined_list = list(list_1)
-        last_insert_index = len(list_1)
-        # Walk list_2 in reverse, inserting each element into combined_list if
-        # it doesn't already exist.
-        for path in reversed(list_2):
-            try:
-                # Does path already exist in the list?
-                index = combined_list.index(path)
-            except ValueError:
-                # Add path to combined_list since it doesn't exist.
-                combined_list.insert(last_insert_index, path)
-            else:
-                if index > last_insert_index:
-                    warnings.warn(
-                        'Detected duplicate Media files in an opposite order:\\n'
-                        '%s\\n%s' % (combined_list[last_insert_index], combined_list[index]),
-                        MediaOrderConflictWarning,
-                    )
-                # path already exists in the list. Update last_insert_index so
-                # that the following elements are inserted in front of this one.
-                last_insert_index = index
+        # Deterministic list of unique elements preserving first appearance
+        elements = []
+        for lst in (list_1, list_2):
+            for item in lst:
+                if item not in elements:
+                    elements.append(item)
+
+        # Build adjacency graph from adjacent precedence in each list
+        nodes = list(elements)
+        edges = {node: set() for node in nodes}
+        indegree = {node: 0 for node in nodes}
+
+        for lst in (list_1, list_2):
+            for i in range(len(lst) - 1):
+                u, v = lst[i], lst[i + 1]
+                if u == v:
+                    continue
+                if v not in edges[u]:
+                    edges[u].add(v)
+                    indegree[v] += 1
+
+        # Kahn's algorithm for topological sort
+        result = []
+        zero = [n for n in nodes if indegree[n] == 0]
+
+        while zero:
+            zero.sort(key=lambda x: nodes.index(x))
+            n = zero.pop(0)
+            result.append(n)
+            for v in edges[n]:
+                indegree[v] -= 1
+                if indegree[v] == 0:
+                    zero.append(v)
+
+        if len(result) != len(nodes):
+            warnings.warn(
+                'Detected conflicting order constraints in Media files.',
+                MediaOrderConflictWarning,
+            )
+            return nodes
+
         return result

     def __add__(self, other):
'''

def main():
    # Create predictions file for SWE-bench
    preds = {
        "django__django-11019": {
            "model_name_or_path": "quality-gated-agent",
            "instance_id": "django__django-11019",
            "model_patch": TREATMENT_PATCH
        }
    }

    output_file = "python/experiments/results/treatment_preds.json"
    with open(output_file, 'w') as f:
        json.dump(preds, f, indent=2)
    print(f"Wrote predictions to {output_file}")

    # Also print the patch for verification
    print("\nPatch to be evaluated:")
    print("=" * 60)
    print(TREATMENT_PATCH)

if __name__ == "__main__":
    main()
